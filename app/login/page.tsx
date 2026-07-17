"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else setError("Senha incorreta.");
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-zinc-950">
      <form onSubmit={submit} className="card w-80 space-y-4">
        <h1 className="text-lg font-bold text-emerald-400">EasySell</h1>
        <div>
          <label className="label">Senha de acesso</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full">Entrar</button>
      </form>
    </div>
  );
}
