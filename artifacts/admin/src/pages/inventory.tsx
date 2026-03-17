import * as React from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, type Product } from "@/hooks/use-products";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Plus, Edit2, Trash2, Search, Star, AlertCircle, Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productSchema } from "@/hooks/use-products";
import { z } from "zod";

const formSchema = productSchema.extend({
  tagsString: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

export function Inventory() {
  const { data: products = [], isLoading } = useProducts();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [searchTerm, setSearchTerm] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);
  
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tagsString: "",
      stock: 0,
      price: 0,
      isFeatured: false,
    }
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    reset({ tagsString: "", stock: 0, price: 0, isFeatured: false });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    reset({
      ...p,
      tagsString: p.tags?.join(", ") || "",
    });
    setIsModalOpen(true);
  };

  const onSubmit = (data: FormData) => {
    const payload: Product = {
      ...data,
      tags: data.tagsString ? data.tagsString.split(",").map(s => s.trim()).filter(Boolean) : [],
    };
    
    if (editingProduct?.id) {
      updateMutation.mutate({ ...payload, id: editingProduct.id }, {
        onSuccess: () => setIsModalOpen(false)
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => setIsModalOpen(false)
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">Manage your festive dolls and stock levels.</p>
        </div>
        <Button onClick={openCreateModal} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" /> Add Product
        </Button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden card-shadow">
        <div className="p-4 border-b border-border/50 flex items-center gap-4 bg-surface-hover/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search products by name or category..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold">Product</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold">Price</th>
                <th className="px-6 py-4 font-semibold">Stock</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">Loading products...</td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No products found.</td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-surface-hover/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex-shrink-0 border border-border">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-6 w-6 m-auto text-muted-foreground/50" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{product.name}</p>
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Star className="w-3 h-3 text-gold fill-gold" />
                            {product.rating} rating
                            {product.isFeatured && <Badge variant="warning" className="ml-2 scale-75">Featured</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="bg-surface">{product.category}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{formatCurrency(product.price)}</div>
                      {product.originalPrice && (
                        <div className="text-xs text-muted-foreground line-through">{formatCurrency(product.originalPrice)}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {product.stock < 5 ? (
                        <div className="flex items-center gap-1.5 text-destructive font-medium">
                          <AlertCircle className="w-4 h-4" />
                          {product.stock} Low
                        </div>
                      ) : (
                        <span className="font-medium text-foreground">{product.stock} units</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(product)}>
                          <Edit2 className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => product.id && handleDelete(product.id)}>
                          <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingProduct ? "Edit Product" : "Add New Product"}
        description={editingProduct ? "Update the details below." : "Fill in the details to add a new doll to the catalog."}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Product Name</label>
              <input {...register("name")} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <textarea {...register("description")} rows={3} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
              {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <select {...register("category")} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-surface">
                <option value="">Select Category</option>
                <option value="Traditional">Traditional</option>
                <option value="Modern">Modern</option>
                <option value="Miniature">Miniature</option>
                <option value="Collector">Collector</option>
                <option value="Children">Children</option>
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Stock Quantity</label>
              <input type="number" {...register("stock")} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              {errors.stock && <p className="text-xs text-destructive">{errors.stock.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Selling Price (₹)</label>
              <input type="number" step="0.01" {...register("price")} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Original Price (₹) - Optional</label>
              <input type="number" step="0.01" {...register("originalPrice")} className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Image URL</label>
              <input {...register("imageUrl")} placeholder="https://images.unsplash.com/..." className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
              {errors.imageUrl && <p className="text-xs text-destructive">{errors.imageUrl.message}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Tags (comma separated)</label>
              <input {...register("tagsString")} placeholder="navratri, handmade, clay" className="w-full px-3 py-2 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" />
            </div>
            
            <div className="space-y-1.5 sm:col-span-2 flex items-center gap-2 mt-2">
              <input type="checkbox" id="isFeatured" {...register("isFeatured")} className="rounded text-primary focus:ring-primary h-4 w-4" />
              <label htmlFor="isFeatured" className="text-sm font-medium cursor-pointer">Feature on homepage</label>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border mt-6">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
              {editingProduct ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
