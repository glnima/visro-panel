import ClientOnly from "@/components/ClientOnly";
import MizanApp from "@/components/MizanApp";

export default function Page() {
  return (
    <ClientOnly
      fallback={<div className="text-center py-24 text-sm text-[#6B5E4F]">در حال بارگذاری اطلاعات مشترک…</div>}
    >
      <MizanApp />
    </ClientOnly>
  );
}
