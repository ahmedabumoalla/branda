import { currentContext } from "./context";

const identifier = (name: string) => { if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Invalid local SQL identifier"); return '"' + name + '"'; };
const errorResult = (cause: unknown) => ({ data: null, error: { message: cause instanceof Error ? cause.message : "Local database error", code: (cause as any)?.code || "LOCAL" } });

/** Internal server adapter: never expose SQL or table selection to browser callers */
class Query {
  private fields = "*"; private method = "select"; private values: unknown[] = []; private filters: string[] = [];
  private orders: string[] = []; private max: number | null = null; private skip = 0; private singleMode = "";
  private payload: any = null; private conflict = ""; private countRequested = false; private head = false;
  constructor(private table: string) { identifier(table); }
  private bind(value: unknown) { this.values.push(value); return "$" + this.values.length; }
  select(fields = "*", options?: any) { this.fields = fields; this.countRequested = !!options?.count; this.head = !!options?.head; return this; }
  insert(value: any) { this.method = "insert"; this.payload = value; return this; }
  update(value: any) { this.method = "update"; this.payload = value; return this; }
  upsert(value: any, options?: any) { this.method = "upsert"; this.payload = value; this.conflict = options?.onConflict || "id"; return this; }
  delete() { this.method = "delete"; return this; }
  eq(key: string, value: unknown) { this.filters.push(`${identifier(key)} = ${this.bind(value)}`); return this; }
  neq(key: string, value: unknown) { this.filters.push(`${identifier(key)} <> ${this.bind(value)}`); return this; }
  gt(key: string, value: unknown) { this.filters.push(`${identifier(key)} > ${this.bind(value)}`); return this; }
  gte(key: string, value: unknown) { this.filters.push(`${identifier(key)} >= ${this.bind(value)}`); return this; }
  lt(key: string, value: unknown) { this.filters.push(`${identifier(key)} < ${this.bind(value)}`); return this; }
  lte(key: string, value: unknown) { this.filters.push(`${identifier(key)} <= ${this.bind(value)}`); return this; }
  is(key: string, value: unknown) { if (value !== null && typeof value !== "boolean") throw new Error("Invalid is filter"); this.filters.push(`${identifier(key)} IS ${value === null ? "NULL" : value ? "TRUE" : "FALSE"}`); return this; }
  in(key: string, values: unknown[]) { if (!Array.isArray(values)) throw new Error("Invalid in filter"); this.filters.push(values.length ? `${identifier(key)} IN (${values.map(v => this.bind(v)).join(",")})` : "FALSE"); return this; }
  like(key: string, value: unknown) { this.filters.push(`${identifier(key)} LIKE ${this.bind(value)}`); return this; }
  ilike(key: string, value: unknown) { this.filters.push(`${identifier(key)} ILIKE ${this.bind(value)}`); return this; }
  contains(key: string, value: unknown) { this.filters.push(`${identifier(key)} @> ${this.bind(JSON.stringify(value))}::jsonb`); return this; }
  match(value: Record<string, unknown>) { for (const [key, item] of Object.entries(value)) this.eq(key, item); return this; }
  not(key: string, op: string, value: unknown) { if (op === "is" && value === null) this.filters.push(`${identifier(key)} IS NOT NULL`); else if (op === "eq") this.neq(key, value); else throw new Error("Unsupported local filter"); return this; }
  order(key: string, options?: any) { this.orders.push(`${identifier(key)} ${options?.ascending === false ? "DESC" : "ASC"}${options?.nullsFirst === undefined ? "" : options.nullsFirst ? " NULLS FIRST" : " NULLS LAST"}`); return this; }
  limit(value: number) { if (!Number.isInteger(value) || value < 0 || value > 100000) throw new Error("Invalid query limit"); this.max = value; return this; }
  range(from: number, to: number) { this.limit(to - from + 1); if (!Number.isInteger(from) || from < 0) throw new Error("Invalid query offset"); this.skip = from; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  private columns() {
    return this.fields.split(",").map(field => { const parts = field.trim().split(":"); return parts.length === 2 ? `${identifier(parts[1])} AS ${identifier(parts[0])}` : field.trim() === "*" ? "*" : identifier(field.trim()); }).join(",");
  }
  async execute() {
    try {
      const context = currentContext(), table = "public." + identifier(this.table), columns = this.columns();
      const where = this.filters.length ? " WHERE " + this.filters.join(" AND ") : "";
      let sql: string;
      if (this.method === "select") sql = `SELECT ${columns}${this.countRequested ? ",count(*) OVER() AS __local_count" : ""} FROM ${table}${where}${this.orders.length ? " ORDER BY " + this.orders.join(",") : ""}${this.max === null ? "" : " LIMIT " + this.max}${this.skip ? " OFFSET " + this.skip : ""}`;
      else if (this.method === "delete") sql = `DELETE FROM ${table}${where} RETURNING ${columns}`;
      else if (this.method === "update") sql = `UPDATE ${table} SET ${Object.entries(this.payload).map(([key, value]) => `${identifier(key)}=${this.bind(value)}`).join(",")}${where} RETURNING ${columns}`;
      else {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload]; const keys = Object.keys(rows[0] || {});
        if (!keys.length || !rows.length) throw new Error("No data supplied");
        sql = `INSERT INTO ${table} (${keys.map(identifier).join(",")}) VALUES ${rows.map(row => "(" + keys.map(key => this.bind(row[key] ?? null)).join(",") + ")").join(",")}`;
        if (this.method === "upsert") { const conflict = this.conflict.split(","); const changes = keys.filter(key => !conflict.includes(key)); sql += ` ON CONFLICT (${conflict.map(identifier).join(",")}) ${changes.length ? "DO UPDATE SET " + changes.map(key => `${identifier(key)}=excluded.${identifier(key)}`).join(",") : "DO NOTHING"}`; }
        sql += " RETURNING " + columns;
      }
      const result = await context.engine.queryAs(context.user.id, sql, this.values); const rows = result.rows || [];
      const count = this.countRequested ? Number(rows[0]?.__local_count || 0) : undefined; for (const row of rows) delete row.__local_count;
      if (this.singleMode && (rows.length > 1 || (this.singleMode === "single" && rows.length !== 1))) return { data: null, error: { code: "PGRST116", message: "Expected one row" }, count };
      return { data: this.head ? null : this.singleMode ? rows[0] ?? null : rows, error: null, ...(count === undefined ? {} : { count }) };
    } catch (cause) { return errorResult(cause); }
  }
  then(resolve: any, reject: any) { return this.execute().then(resolve, reject); }
}

function storage(bucket: string) {
  const service = () => { const s = currentContext().storage; if (!s) throw new Error("تخزين الملفات المحلي غير متاح"); return s; };
  return {
    async upload(path: string, body: any, options?: any) { try { const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : new Uint8Array(body); const data = await service().upload(bucket, path, bytes, options); return { data: data || { path }, error: null }; } catch (cause) { return errorResult(cause); } },
    async download(path: string) { try { return { data: await service().download(bucket, path), error: null }; } catch (cause) { return errorResult(cause); } },
    async info(path: string) { try { const context=currentContext(); const result=await context.engine.queryAs(context.user.id,'SELECT id,name,metadata,created_at,updated_at FROM storage.objects WHERE bucket_id=$1 AND name=$2',[bucket,path]);const row=result.rows[0];return{data:row?{...row,size:row.metadata?.size,mimetype:row.metadata?.mimetype,contentType:row.metadata?.mimetype}:null,error:null}; } catch(cause) { return errorResult(cause); } },
    async remove(paths: string[]) { try { return { data: await service().remove(bucket, paths), error: null }; } catch (cause) { return errorResult(cause); } },
    async createSignedUploadUrl(path: string) { try { return { data: await service().signUpload(bucket, path), error: null }; } catch (cause) { return errorResult(cause); } },
    async createSignedUrl(path: string) { try { return { data: { signedUrl: await service().signRead(bucket, path) }, error: null }; } catch (cause) { return errorResult(cause); } },
    async createSignedUrls(paths: string[]) { try { return { data: await Promise.all(paths.map(async path => ({ path, signedUrl: await service().signRead(bucket, path), error: null }))), error: null }; } catch (cause) { return errorResult(cause); } },
    getPublicUrl(path: string) { return { data: { publicUrl: "/api/storage/file?bucket=" + encodeURIComponent(bucket) + "&path=" + encodeURIComponent(path) } }; },
  };
}

export function createAdminClient() {
  // Local adapters never elevate past the authenticated actor. SQL retains RLS.
  return {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown> = {}) => { try { const c = currentContext(); return { data: await c.engine.rpc(c.user.id, name, args), error: null }; } catch (cause) { return errorResult(cause); } },
    storage: { from: storage, getBucket: async (bucket: string) => { try { const context=currentContext(); const result=await context.engine.queryAs(context.user.id,'SELECT id,name,public FROM storage.buckets WHERE id=$1',[bucket]); return {data:result.rows[0] || null,error:null}; } catch(cause) {return errorResult(cause);} } },
    auth: {
      getUser: async () => ({ data: { user: currentContext().user }, error: null }),
      getSession: async () => ({ data: { session: { user: currentContext().user } }, error: null }),
      signOut: async () => { await currentContext().logout?.(); return { error: null }; },
      admin: { createUser: async () => errorResult(new Error("استخدم إدارة المستخدمين المحلية")), deleteUser: async () => errorResult(new Error("استخدم إدارة المستخدمين المحلية")) },
    },
  };
}
export function createClient(..._args: any[]) { return createAdminClient(); }
export const createServerClient = createClient;
export const createBrowserClient = createClient;
export async function getSessionUser() { return currentContext().user; }
export async function getOptionalSessionUser() { return currentContext().user; }
