import React, { lazy, Suspense } from "react";
export default function dynamic(loader: any, options: any = {}) {
  const Component = lazy(async () => { const loaded = await loader(); return { default: loaded.default || loaded }; });
  return function Dynamic(props: any) { const Loading = options.loading; return <Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></Suspense>; };
}
