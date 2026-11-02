import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Palette } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ACCENT_PRESETS, isHexColor, useTheme, type ThemeMode } from "@/hooks/use-theme";
import { updateProfile } from "@/lib/profiles.functions";

export const Route = createFileRoute("/_authenticated/settings/display")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Display settings / DeepSocial" },
      { name: "description", content: "Pick your accent color and choose between dark and true-black themes." },
      { property: "og:title", content: "Display settings / DeepSocial" },
      { property: "og:description", content: "Pick your accent color and choose between dark and true-black themes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DisplaySettingsPage,
});

function DisplaySettingsPage() {
  const { accentColor, themeMode, setTheme } = useTheme();
  const { refreshProfile } = useAuth();
  const save = useServerFn(updateProfile);
  const [customHex, setCustomHex] = useState(accentColor);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const persist = async (next: { accentColor?: string; themeMode?: ThemeMode }) => {
    setTheme(next);
    setIsSaving(true);
    setMessage("");
    try {
      await save({
        data: {
          ...(next.accentColor ? { accent_color: next.accentColor } : {}),
          ...(next.themeMode ? { theme_mode: next.themeMode } : {}),
        },
      });
      await refreshProfile();
      setMessage("Display preferences saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save display preferences.");
    } finally {
      setIsSaving(false);
    }
  };

  const applyCustom = () => {
    if (!isHexColor(customHex)) {
      setMessage("Enter a hex color like #1d9bf0.");
      return;
    }
    persist({ accentColor: customHex.toLowerCase() });
  };

  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <Palette className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Display</h1>
      </div>

      <div className="space-y-8 p-4">
        <p className="text-sm text-muted-foreground">
          Manage your accent color and background. These settings affect this account everywhere you sign in.
        </p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <section className="space-y-3">
          <h2 className="text-base font-bold">Accent color</h2>
          <div className="flex flex-wrap gap-3">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => persist({ accentColor: preset.value })}
                disabled={isSaving}
                aria-label={preset.label}
                aria-pressed={accentColor.toLowerCase() === preset.value}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-border transition-transform hover:scale-105"
                style={{ backgroundColor: preset.value }}
              >
                {accentColor.toLowerCase() === preset.value && <Check className="h-5 w-5 text-background" />}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-3 pt-2">
            <div className="space-y-2">
              <Label htmlFor="customHex">Custom hex</Label>
              <Input
                id="customHex"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                placeholder="#1d9bf0"
                maxLength={7}
                className="w-40 rounded-md border-border bg-background"
              />
            </div>
            <Button onClick={applyCustom} disabled={isSaving} className="rounded-full px-5 font-bold">
              Apply
            </Button>
            <div
              className="h-10 w-10 rounded-full border-2 border-border"
              style={{ backgroundColor: isHexColor(customHex) ? customHex : accentColor }}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold">Background</h2>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { value: "dark", label: "Dark", hint: "Standard dark theme" },
                { value: "black", label: "Black", hint: "True black for OLED screens" },
              ] as { value: ThemeMode; label: string; hint: string }[]
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => persist({ themeMode: option.value })}
                disabled={isSaving}
                className={`rounded-2xl border-2 p-4 text-left transition-colors ${
                  themeMode === option.value ? "border-primary" : "border-border hover:bg-muted/20"
                }`}
              >
                <span className="block font-bold">{option.label}</span>
                <span className="block text-sm text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
