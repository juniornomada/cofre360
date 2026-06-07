import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardFooter } from './ui/card';
import { X, ShieldCheck } from 'lucide-react';

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookie-consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[100] md:bottom-6 md:left-auto md:right-6 md:max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Card className="border-primary/20 shadow-2xl bg-background/95 backdrop-blur-md">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="bg-primary/10 p-2 rounded-full hidden sm:block">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                Privacidade e LGPD
                <ShieldCheck className="h-4 w-4 text-primary sm:hidden" />
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Utilizamos cookies e tecnologias semelhantes para melhorar sua experiência e proteger seus dados, em conformidade com a LGPD. Ao continuar, você concorda com nossos termos.
              </p>
            </div>
            <button 
              onClick={() => setIsVisible(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 justify-end pb-6">
          <Button variant="outline" size="sm" onClick={handleDecline}>
            Recusar
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Aceitar e continuar
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
