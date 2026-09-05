"use client";

import { isApiError } from "@henge/shared";
import { useEffect, useState } from "react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  todayGenerationCount: number;
}

/** ユーザー一覧。**閲覧のみ**。更新・削除の導線は持たない */
export function AdminUserList() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/users?limit=50");
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(isApiError(body) ? body.error.message : "一覧を取得できませんでした");
        return;
      }
      setUsers((body as { users: AdminUser[] }).users);
    })();
  }, []);

  if (error !== null) return <p className="mt-10 text-kinari/70">{error}</p>;
  if (users === null) return <p className="mt-10 text-kinari/50">読み込み中</p>;

  return (
    <table className="mt-10 w-full text-sm">
      <thead>
        <tr className="border-b border-kinari/10 text-left tracking-widest text-kinari/50">
          <th className="py-3 font-normal">名前</th>
          <th className="py-3 font-normal">メール</th>
          <th className="py-3 font-normal">登録日</th>
          <th className="py-3 text-right font-normal">本日の生成</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b border-kinari/5">
            <td className="py-3 text-kinari">{user.name}</td>
            <td className="py-3 text-kinari/60">{user.email}</td>
            <td className="py-3 font-mono text-kinari/60">{user.createdAt.slice(0, 10)}</td>
            <td className="py-3 text-right font-mono text-kinari/70">
              {user.todayGenerationCount}
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={4} className="py-10 text-center text-kinari/50">
              ユーザーがいません
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
