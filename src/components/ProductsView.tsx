"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { faNum, faPrice } from "@/lib/format";
import { CATEGORIES, type Category, type Product } from "@/lib/types";

type Props = {
  products: Product[];
  confirmDeleteProductId: string | null;
  onAddProduct: (name: string, category: Category, price: number) => boolean;
  onDeleteProduct: (id: string) => void;
};

const emptyProductForm = () => ({ name: "", category: CATEGORIES[0] as Category, price: "" });

const inputCls =
  "rounded-lg border border-[#D9CDB6] bg-[#FBF8F1] px-3 py-2 text-sm text-[#2B2420] outline-none focus:border-[#9C7A3C]";

export default function ProductsView({ products, confirmDeleteProductId, onAddProduct, onDeleteProduct }: Props) {
  const [productForm, setProductForm] = useState(emptyProductForm);

  const submitProduct = (e: FormEvent) => {
    e.preventDefault();
    const price = Number(productForm.price) >= 0 ? Number(productForm.price) : 0;
    if (onAddProduct(productForm.name.trim(), productForm.category, price)) {
      setProductForm(emptyProductForm());
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="rounded-xl border border-[#D9CDB6] bg-[#F7F2E7] p-5 shadow-sm">
          <h2 className="text-sm font-bold mb-4">افزودن مدل جدید</h2>
          <form onSubmit={submitProduct} className="flex flex-col sm:flex-row gap-3.5 items-stretch sm:items-end">
            <label className="flex-1 flex flex-col gap-1 text-xs text-[#6B5E4F]">
              نام مدل
              <input
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثلاً میز عسلی گرد"
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
              دسته
              <select
                value={productForm.category}
                onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value as Category }))}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[#6B5E4F]">
              قیمت (تومان)
              <input
                type="number"
                min={0}
                step="0.01"
                value={productForm.price}
                onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="۰"
                className={inputCls + " w-32"}
              />
            </label>
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#3B241A] text-[#F3EEE1] text-sm font-medium py-2.5 px-6 hover:bg-[#4A2E22] transition-colors whitespace-nowrap"
            >
              <Plus size={15} />
              افزودن
            </button>
          </form>
        </div>
      </section>

      <section>
        <h1 className="text-lg font-bold mb-1">مدل‌ها ({faNum(products.length)})</h1>
        <p className="text-sm text-[#6B5E4F] mb-4">تا ۲۰۰ مدل می‌تونی اضافه کنی — قیمت فقط اینجا و توی فروشگاه دیده می‌شه</p>
        <div className="rounded-xl border border-[#D9CDB6] overflow-hidden bg-[#F7F2E7]">
          {products.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[#8A7B60]">هنوز مدلی اضافه نشده</div>
          )}
          {products.map((p) => (
            <div
              key={p.id}
              className="px-4 py-3 border-b border-[#E4DCC8] last:border-0 flex items-center justify-between gap-3 flex-wrap"
            >
              <div>
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-[#6B5E4F]"> · {p.category}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-[#4A2E22] font-medium">{faPrice(p.price)} تومان</span>
                <button
                  onClick={() => onDeleteProduct(p.id)}
                  title={confirmDeleteProductId === p.id ? "برای حذف قطعی دوباره بزن" : "حذف مدل"}
                  className={
                    "flex items-center gap-1 transition-colors " +
                    (confirmDeleteProductId === p.id
                      ? "text-[#8A3C2F] font-semibold"
                      : "text-[#8A7B60] hover:text-[#8A3C2F]")
                  }
                >
                  <Trash2 size={14} />
                  {confirmDeleteProductId === p.id && <span className="text-[10px]">دوباره بزن</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
