import ClientOnly from "@/components/ClientOnly";
import PrintSheet from "@/components/PrintSheet";

export default function PrintPage() {
  return (
    <ClientOnly fallback={null}>
      <PrintSheet />
    </ClientOnly>
  );
}
