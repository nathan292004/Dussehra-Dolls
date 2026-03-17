import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-10 h-10 text-destructive" />
      </div>
      <h1 className="text-4xl font-display font-bold text-foreground mb-2">404 - Page Not Found</h1>
      <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
        The admin page you are looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <Button size="lg" className="rounded-full px-8">
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
}
