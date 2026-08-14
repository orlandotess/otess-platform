"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "../../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const t = useTranslations("auth.callback");
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      const urlParams = new URLSearchParams(window.location.search);
      const isRecovery = urlParams.get("type") === "recovery";
      const destination = isRecovery ? "/reset-password" : "/";

      // Handle hash-based tokens (implicit flow): #access_token=...&refresh_token=...
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) { setError(error.message); return; }
          router.push(isRecovery || params.get("type") === "recovery" ? "/reset-password" : "/");
          return;
        }
      }

      // Handle code-based flow (PKCE): ?code=...
      const code = urlParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); return; }
        router.push(destination);
        return;
      }

      // No token or code found
      router.push("/login");
    }
    handleCallback();
  }, [router]);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
        <h2>{t("errorTitle")}</h2>
        <p style={{ color: "var(--ink-faint)" }}>{error}</p>
        <a href="/login" style={{ color: "var(--amber)" }}>{t("goToLogin")}</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
      <p>{t("processing")}</p>
    </div>
  );
}
