import { useState, useEffect } from "react";

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1500);
    const finish = setTimeout(onFinish, 2000);
    return () => {
      clearTimeout(timer);
      clearTimeout(finish);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src="/icons/icon-512x512.png"
        alt="UPLAY Pagamentos"
        className="w-28 h-28 mb-6 animate-pulse"
      />
      <h1 className="text-2xl font-bold text-foreground tracking-wide">
        <BrandName />
      </h1>
      <p className="text-sm text-muted-foreground mt-2">Carregando...</p>
    </div>
  );
};

export default SplashScreen;
