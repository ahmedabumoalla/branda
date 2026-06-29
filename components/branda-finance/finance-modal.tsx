import type { ReactNode } from "react";

type FinanceModalProps = {
  title: string;
  children: ReactNode;
};

export function FinanceModal({ title, children }: FinanceModalProps) {
  return (
    <section className="max-h-[calc(100vh-24px)] w-full max-w-[min(96vw,760px)] min-w-0 overflow-hidden rounded-[8px] border border-[#E3CFB0] bg-[#FFFDF8] shadow-2xl">
      <div className="border-b border-[#E8D8C2] px-4 py-3">
        <h2 className="text-lg font-black text-[#2F241D]">{title}</h2>
      </div>
      <div className="max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-hidden p-4">{children}</div>
    </section>
  );
}
