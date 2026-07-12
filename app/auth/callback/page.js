"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState(null);

  useEffect(() => {
    async function handleCallback() {
      // Handle hash-based tokens (implicit flow): #access_token=...&refresh_token=...
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) { setError(error.message); return; }
          router.push("/");
          return;
        }
      }

      // Handle code-based flow (PKCE): ?code=...
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); return; }
        router.push("/");
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
        <h2>Error al procesar invitación</h2>
        <p style={{ color: "var(--ink-faint)" }}>{error}</p>
        <a href="/login" style={{ color: "var(--amber)" }}>Ir a login</a>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif", textAlign: "center" }}>
      <p>Procesando invitación...</p>
    </div>
  );
}
