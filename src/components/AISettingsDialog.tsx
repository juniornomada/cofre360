import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { Settings, Sparkles } from "lucide-react";

const ALLOWED_MODELS = [
  "google/gemini-2.0-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-image",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "anthropic/claude-3-5-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini"
];

export function AISettingsDialog() {
  const [open, setOpen] = useState(false);
  const { geminiModel, updateGeminiModel, loading } = useUserPreferences();
  const [selectedModel, setSelectedModel] = useState(geminiModel);

  const handleSave = async () => {
    await updateGeminiModel(selectedModel);
    setOpen(false);
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={() => {
          setSelectedModel(geminiModel);
          setOpen(true);
        }}
        className="rounded-full hover:bg-primary/10"
      >
        <Settings className="h-5 w-5 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Configurações de IA
            </DialogTitle>
            <DialogDescription>
              Escolha o modelo de Inteligência Artificial para processar seus PDFs.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Modelo Gemini / IA
              </label>
              <Select 
                value={selectedModel} 
                onValueChange={setSelectedModel}
                disabled={loading}
              >
                <SelectTrigger className="w-full rounded-xl border-border bg-background">
                  <SelectValue placeholder="Selecione um modelo" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-card">
                  {ALLOWED_MODELS.map((model) => (
                    <SelectItem key={model} value={model} className="rounded-lg focus:bg-primary focus:text-primary-foreground">
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Nota: Se o modelo falhar, o sistema tentará automaticamente um modelo estável como fallback.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button 
              type="button" 
              onClick={handleSave}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
