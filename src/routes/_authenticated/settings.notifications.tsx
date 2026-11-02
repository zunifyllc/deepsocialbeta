import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Notification settings / DeepSocial" },
      { name: "description", content: "Choose which DeepSocial activity sends you an email update." },
      { property: "og:title", content: "Notification settings / DeepSocial" },
      { property: "og:description", content: "Choose which DeepSocial activity sends you an email update." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationSettingsPage,
});

const ROWS: { key: keyof Omit<NotificationSettings, "user_id">; label: string; description: string }[] = [
  { key: "email_likes", label: "Likes", description: "Email me when someone likes my post." },
  { key: "email_replies", label: "Replies", description: "Email me when someone replies to my post." },
  { key: "email_follows", label: "Follows", description: "Email me when someone follows me." },
  { key: "email_reposts", label: "Reposts", description: "Email me when someone reposts my post." },
];

function NotificationSettingsPage() {
  const load = useServerFn(getNotificationSettings);
  const save = useServerFn(updateNotificationSettings);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    load({}).then(setSettings);
  }, [load]);

  const toggle = async (key: keyof Omit<NotificationSettings, "user_id">, value: boolean) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setMessage("");
    try {
      const saved = await save({
        data: {
          email_likes: next.email_likes,
          email_replies: next.email_replies,
          email_follows: next.email_follows,
          email_reposts: next.email_reposts,
        },
      });
      setSettings(saved);
      setMessage("Preferences saved.");
    } catch {
      setSettings(settings);
      setMessage("Could not save preferences.");
    }
  };

  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Notification settings</h1>
      </div>

      <div className="space-y-2 p-4">
        <p className="text-sm text-muted-foreground">
          Choose which activity you'd like to hear about by email. Email delivery rolls out soon — your choices are
          stored now.
        </p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <div className="divide-y divide-border pt-2">
          {ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 py-4">
              <div>
                <Label htmlFor={row.key} className="text-base font-bold">
                  {row.label}
                </Label>
                <p className="text-sm text-muted-foreground">{row.description}</p>
              </div>
              <Switch
                id={row.key}
                checked={settings?.[row.key] ?? false}
                disabled={!settings}
                onCheckedChange={(value) => toggle(row.key, value)}
              />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
