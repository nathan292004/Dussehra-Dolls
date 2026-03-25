import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

type Vendor = { id: number; name: string; contact?: string | null; email?: string | null; phone?: string | null; createdAt?: string };

const vendorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
});
type FormData = z.infer<typeof vendorSchema>;

function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: ["/api/admin/vendors"],
    queryFn: async () => { const res = await fetch("/api/admin/vendors"); return res.ok ? res.json() : []; },
  });
}
function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormData) => { const res = await fetch("/api/admin/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(); return res.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/vendors"] }),
  });
}
function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Vendor) => { const res = await fetch(`/api/admin/vendors/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(); return res.json(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/vendors"] }),
  });
}
function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error(); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/vendors"] }),
  });
}

export function Vendors() {
  const { data: vendors = [], isLoading } = useVendors();
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vendor | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(vendorSchema) });

  const openCreate = () => { setEditing(null); reset({ name: "", contact: "", email: "", phone: "" }); setIsModalOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); reset({ name: v.name, contact: v.contact || "", email: v.email || "", phone: v.phone || "" }); setIsModalOpen(true); };

  const onSubmit = (data: FormData) => {
    if (editing) {
      updateMutation.mutate({ ...editing, ...data }, { onSuccess: () => setIsModalOpen(false) });
    } else {
      createMutation.mutate(data, { onSuccess: () => setIsModalOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl text-ink">Vendors</h1>
          <p className="text-warm-secondary mt-1 text-sm">Manage your doll suppliers and partners.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Vendor</Button>
      </div>

      <div className="bg-white rounded-2xl border border-warm-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment">
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Name</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Contact</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Email</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Phone</th>
                <th className="px-4 py-3 text-left text-[11px] text-warm-secondary uppercase tracking-wider font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-muted">Loading...</td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-warm-muted">No vendors yet. Add your first vendor.</td></tr>
              ) : (
                vendors.map(v => (
                  <tr key={v.id} className="border-t border-parchment hover:bg-[#F6FBF7] transition-colors">
                    <td className="px-4 py-3 font-medium text-ink text-[13px]">{v.name}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{v.contact || "—"}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{v.email || "—"}</td>
                    <td className="px-4 py-3 text-warm-secondary text-[13px]">{v.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v)}><Edit2 className="w-4 h-4" /> Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this vendor?")) deleteMutation.mutate(v.id); }}><Trash2 className="w-4 h-4" /> Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editing ? "Edit Vendor" : "Add Vendor"} description="Enter vendor details below.">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Vendor Name *</label>
            <input {...register("name")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact Person</label>
            <input {...register("contact")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email</label>
            <input type="email" {...register("email")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Phone</label>
            <input {...register("phone")} className="w-full px-3 py-2 rounded-lg border border-warm-border focus:ring-2 focus:ring-forest/20 outline-none text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-warm-border">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>{editing ? "Save Changes" : "Add Vendor"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
