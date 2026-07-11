import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";


type Category = {
  id: string;
  label: string;
  icon: string;
  sort_order: number;
};

type Subcategory = {
  id: string;
  category_id: string;
  label: string;
  icon: string;
  sort_order: number;
};

type EditState =
  | { kind: "category"; id?: string; label: string; icon: string }
  | { kind: "subcategory"; id?: string; category_id: string; label: string; icon: string }
  | null;

type DeleteState =
  | { kind: "category"; id: string; label: string }
  | { kind: "subcategory"; id: string; label: string }
  | null;

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [del, setDel] = useState<DeleteState>(null);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setLoading(true);
    try {
      const [c, s] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("subcategories").select("*").order("sort_order"),
      ]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      
      if (c.data) setCategories(c.data as Category[]);
      if (s.data) setSubcategories(s.data as Subcategory[]);
    } catch (error: any) {
      console.error("Error loading categories:", error);
      toast.error("Erro ao carregar categorias: " + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    load();
  }, []);

  async function saveEdit() {
    try {
      if (!edit) return;
      if (!edit.label.trim()) {
        toast.error("Informe um nome");
        return;
      }
      if (edit.kind === "category") {
        if (edit.id) {
          const { error } = await supabase
            .from("categories")
            .update({ label: edit.label.trim(), icon: edit.icon || "📄" })
            .eq("id", edit.id);
          if (error) throw error;
          toast.success("Categoria atualizada");
        } else {
          const max = Math.max(0, ...categories.map((c) => c.sort_order));
          const { error } = await supabase.from("categories").insert({
            id: crypto.randomUUID(),
            label: edit.label.trim(),
            icon: edit.icon || "📄",
            sort_order: max + 1,
          });
          if (error) throw error;
          toast.success("Categoria criada");
        }
      } else {
        if (edit.id) {
          const { error } = await supabase
            .from("subcategories")
            .update({ label: edit.label.trim(), icon: edit.icon || "📄" })
            .eq("id", edit.id);
          if (error) throw error;
          toast.success("Subcategoria atualizada");
        } else {
          const max = Math.max(
            0,
            ...subcategories.filter((s) => s.category_id === edit.category_id).map((s) => s.sort_order)
          );
          const { error } = await supabase.from("subcategories").insert({
            id: crypto.randomUUID(),
            category_id: edit.category_id,
            label: edit.label.trim(),
            icon: edit.icon || "📄",
            sort_order: max + 1,
          });
          if (error) throw error;
          toast.success("Subcategoria criada");
        }
      }
      setEdit(null);
      load();
    } catch (error: any) {
      console.error("Error saving category/subcategory:", error);
      toast.error("Erro ao salvar: " + (error.message || "Erro desconhecido"));
    }
  }

  async function confirmDelete() {
    try {
      if (!del) return;
      const table = del.kind === "category" ? "categories" : "subcategories";
      const { error } = await supabase.from(table).delete().eq("id", del.id);
      if (error) throw error;
      toast.success("Excluído");
      setDel(null);
      load();
    } catch (error: any) {
      console.error("Error deleting category/subcategory:", error);
      toast.error("Erro ao excluir: " + (error.message || "Erro desconhecido"));
    }
  }

  return (
    <div className="min-h-dvh bg-background pb-4">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="rounded-lg p-1.5 hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">Categorias</h1>
          </div>
          <Button
            size="sm"
            onClick={() => setEdit({ kind: "category", label: "", icon: "📄" })}
          >
            <Plus className="h-4 w-4" /> Nova
          </Button>
        </div>
      </header>

      <main className="px-4 py-4">
        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Carregando...</p>
        ) : categories.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Nenhuma categoria</p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {categories.map((cat) => {
              const subs = subcategories.filter((s) => s.category_id === cat.id);
              return (
                <Card key={cat.id} className="overflow-hidden">
                  <AccordionItem value={cat.id} className="border-0">
                    <div className="flex items-center gap-1 px-3">
                      <AccordionTrigger className="flex-1 py-3 hover:no-underline">
                        <div className="flex items-center gap-2 text-left">
                          <span className="text-xl">{cat.icon}</span>
                          <div>
                            <p className="font-medium">{cat.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {subs.length} subcategoria{subs.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEdit({ kind: "category", id: cat.id, label: cat.label, icon: cat.icon });
                        }}
                        className="rounded-lg p-2 hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDel({ kind: "category", id: cat.id, label: cat.label });
                        }}
                        className="rounded-lg p-2 text-destructive hover:bg-muted"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <AccordionContent className="px-3 pb-3">
                      <div className="space-y-1.5">
                        {subs.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
                          >
                            <span className="text-lg">{sub.icon}</span>
                            <span className="flex-1 text-sm">{sub.label}</span>
                            <button
                              onClick={() =>
                                setEdit({
                                  kind: "subcategory",
                                  id: sub.id,
                                  category_id: cat.id,
                                  label: sub.label,
                                  icon: sub.icon,
                                })
                              }
                              className="rounded p-1.5 hover:bg-background"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDel({ kind: "subcategory", id: sub.id, label: sub.label })}
                              className="rounded p-1.5 text-destructive hover:bg-background"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() =>
                            setEdit({
                              kind: "subcategory",
                              category_id: cat.id,
                              label: "",
                              icon: "📄",
                            })
                          }
                        >
                          <Plus className="h-4 w-4" /> Adicionar subcategoria
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Card>
              );
            })}
          </Accordion>
        )}
      </main>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {edit?.id ? "Editar" : "Nova"} {edit?.kind === "category" ? "categoria" : "subcategoria"}
            </DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Ícone (emoji)</label>
                <Input
                  value={edit.icon}
                  onChange={(e) => setEdit({ ...edit, icon: e.target.value })}
                  maxLength={4}
                  className="text-center text-2xl"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
                <Input
                  value={edit.label}
                  onChange={(e) => setEdit({ ...edit, label: e.target.value })}
                  placeholder="Nome"
                  autoFocus
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={saveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{del?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {del?.kind === "category"
                ? "Todas as subcategorias também serão excluídas. Transações já lançadas não são afetadas."
                : "Esta subcategoria será removida. Transações já lançadas não são afetadas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
 }

 export const Route = createFileRoute("/categories")({
   component: CategoriesPage,
 });
