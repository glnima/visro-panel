import AuthGate from "@/components/AuthGate";
import ClientOnly from "@/components/ClientOnly";

export default function Page() {
  return (
    <ClientOnly fallback={<div className="text-center py-24 text-sm text-[#6B5E4F]">در حال بارگذاری…</div>}>
      <AuthGate />
    </ClientOnly>
  );
}
