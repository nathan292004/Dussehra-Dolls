import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Edit2, Trash2, Package, Hash, ImagePlus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";

const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  price: z.coerce.number().min(0),
  originalPrice: z.coerce.number().optional().nullable(),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().optional().nullable(),
  stock: z.coerce.number().int().min(0),
  location: z.string().optional().nullable(),
  isFeatured: z.boolean().optional().default(false),
  tagsString: z.string().optional(),
});

type FormData = z.infer<typeof productSchema>;

type Product = {
  id: number;
  name: string;
  description?: string | null;
  serialNumber?: string | null;
  price: number;
  originalPrice?: number | null;
  category: string;
  imageUrl?: string | null;
  stock: number;
  location?: string | null;
  isFeatured: boolean;
  tags?: string[];
  rating?: number;
  createdAt?: string;
  updatedAt?: string;
};

function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
    queryFn: async () => {
      const res = await fetch("/api/admin/products");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });
}

function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<Product, "id">) => {
      const res = await fetch("/api/admin/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/products"] }),
  });
}

function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Product) => {
      const res = await fetch(`/api/admin/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/products"] }),
  });
}

function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/products"] }),
  });
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.url as string;
}

export function Products() {
  const { data: products = [], isLoading } = useProducts();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(productSchema),
    defaultValues: { stock: 0, price: 0, isFeatured: false },
  });

  const currentImageUrl = watch("imageUrl");

  const openCreate = () => {
    setEditingProduct(null);
    reset({ stock: 0, price: 0, isFeatured: false });
    setImageFile(null);
    setImagePreview(null);
    setIsModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    reset({ ...p, tagsString: p.tags?.join(", ") || "" });
    setImageFile(null);
    setImagePreview(p.imageUrl || null);
    setIsModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreview(objectUrl);
    setValue("imageUrl", "");
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setValue("imageUrl", "");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (data: FormData) => {
    try {
      let imageUrl = data.imageUrl || null;

      if (imageFile) {
        setIsUploading(true);
        imageUrl = await uploadImage(imageFile);
        setIsUploading(false);
      }

      const payload = {
        ...data,
        imageUrl,
        tags: data.tagsString ? data.tagsString.split(",").map(s => s.trim()).filter(Boolean) : [],
      };

      if (editingProduct?.id) {
        updateMutation.mutate({ ...payload, id: editingProduct.id } as Product, {
          onSuccess: () => { setIsModalOpen(false); setImageFile(null); setImagePreview(null); },
        });
      } else {
        createMutation.mutate(payload as Omit<Product, "id">, {
          onSuccess: () => { setIsModalOpen(false); setImageFile(null); setImagePreview(null); },
        });
      }
    } catch {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this product? It will be removed from the customer app.")) deleteMutation.mutate(id);
  };

  const isPending = isUploading || createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-ink">Products</h1>
          <p className="text-warm-secondary mt-1 text-sm">Manage your doll catalog — changes are live in the app instantly.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Product</Button>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Image</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Name</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Serial</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Category</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Price</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Stock</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-warm-muted">No products yet. Click "Add Product" to create one.</td></tr>
              ) : (
                products.map(p => (
                  <tr key={p.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3">
                      <div className="w-12 h-12 rounded-lg bg-parchment flex items-center justify-center border border-warm-border overflow-hidden">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-warm-muted" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{p.name}</td>
                    <td className="px-4 py-3">
                      {p.serialNumber ? (
                        <div className="flex items-center gap-1 text-warm-secondary text-xs">
                          <Hash className="w-3 h-3" />{p.serialNumber}
                        </div>
                      ) : <span className="text-warm-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{p.category}</Badge>
                    </td>
                    <td className="px-4 py-3 font-display text-ink text-[13px]" style={{ fontWeight: 600 }}>{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3">
                      <span className={p.stock < 5 ? "text-destructive font-medium" : "text-ink"}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit2 className="w-4 h-4" /> Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4" /> Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingProduct ? "Edit Product" : "Add Product"} description="Changes are reflected in the mobile app immediately.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium">Product Name *</label>
              <input {...register("name")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 focus:border-forest outline-none text-sm" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Serial Number</label>
              <input {...register("serialNumber")} placeholder="e.g. DOLL-001" className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category *</label>
              <select {...register("category")} className="w-full px-3 py-2 rounded-lg border border-warm-border outline-none bg-white text-sm">
                <option value="">Select...</option>
                <option value="Traditional">Traditional</option>
                <option value="Modern">Modern</option>
                <option value="Miniature">Miniature</option>
                <option value="Collector">Collector</option>
                <option value="Children">Children</option>
                <option value="Dolls">Dolls</option>
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Price (₹) *</label>
              <input type="number" step="0.01" {...register("price")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Stock</label>
              <input type="number" {...register("stock")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Original Price (₹)</label>
              <input type="number" step="0.01" {...register("originalPrice")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location / Warehouse</label>
              <input {...register("location")} placeholder="e.g. Warehouse A" className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>

            {/* ── Image Upload ── */}
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Product Image</label>
              <input type="hidden" {...register("imageUrl")} />

              {imagePreview ? (
                <div className="relative w-full h-44 rounded-xl border-2 border-warm-border overflow-hidden bg-parchment group">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-2 right-2 bg-ink/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-36 rounded-xl border-2 border-dashed border-warm-border bg-parchment hover:bg-[#EAF3DE] hover:border-forest transition-colors flex flex-col items-center justify-center gap-2 text-warm-muted hover:text-forest group"
                >
                  <ImagePlus className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">Click to upload image</span>
                  <span className="text-xs">.png, .jpg, .jpeg — max 5 MB</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {imagePreview && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-forest hover:underline"
                >
                  Replace image
                </button>
              )}
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea {...register("description")} rows={2} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none resize-none text-sm" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <input {...register("tagsString")} placeholder="navratri, handmade, clay" className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="isFeatured" {...register("isFeatured")} className="h-4 w-4 rounded text-forest" />
              <label htmlFor="isFeatured" className="text-sm font-medium cursor-pointer">Feature on homepage</label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-warm-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={isPending}>
              {isUploading ? "Uploading image…" : editingProduct ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
