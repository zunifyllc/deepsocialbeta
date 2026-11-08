import { createFileRoute } from "@tanstack/react-router";
import { getRouterInstance } from "@tanstack/react-start";
import type { AnyRoute, AnyRouter } from "@tanstack/react-router";
import {
  isSitemapRouteIncluded,
  sitemapPathForLocation,
  sitemapStaticPaths,
  sitemapXML,
  type SitemapEntry,
} from "@/lib/sitemap";
import { SITE_URL } from "@/lib/site";

const BASE_URL = SITE_URL;

function routeIdByFullPath(router: AnyRouter, fullPath: string): string | undefined {
  for (const [id, route] of Object.entries(router.routesById)) {
    if (route.fullPath === fullPath) return id;
  }
  return undefined;
}

export const Route = createFileRoute("/sitemap.xml")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        if (!BASE_URL) {
          return new Response("Sitemap domain not configured", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const router = await getRouterInstance();
        const entries: SitemapEntry[] = sitemapStaticPaths(router).map((path) => ({ path }));

        // Dynamic public content from Neon (the primary database).
        const { q } = await import("@/lib/neon/core.server");
        const pageSize = 1000;

        // Public profiles -> /$username
        const profileRouteId = routeIdByFullPath(router, "/$username");
        const profileRoute = profileRouteId ? (router.routesById as Record<string, AnyRoute>)[profileRouteId] : undefined;
        if (profileRouteId && isSitemapRouteIncluded(profileRoute)) {
          for (let offset = 0; ; offset += pageSize) {
            const rows = await q<{ username: string }>(
              `select username from public.profiles order by username asc limit $1 offset $2`,
              [pageSize, offset],
            );
            if (rows.length === 0) break;
            for (const row of rows) {
              const location = router.buildLocation({
                to: "/$username",
                params: { username: row.username },
                search: () => ({}),
                hash: "",
              });
              const path = sitemapPathForLocation(router, location, profileRouteId);
              if (path) entries.push({ path });
            }
          }
        }

        // Published posts -> /post/$postId
        const postRouteId = routeIdByFullPath(router, "/post/$postId");
        const postRoute = postRouteId ? (router.routesById as Record<string, AnyRoute>)[postRouteId] : undefined;
        if (postRouteId && isSitemapRouteIncluded(postRoute)) {
          for (let offset = 0; ; offset += pageSize) {
            const rows = await q<{ id: string }>(
              `select id from public.posts where status = 'published' order by id asc limit $1 offset $2`,
              [pageSize, offset],
            );
            if (rows.length === 0) break;
            for (const row of rows) {
              const location = router.buildLocation({
                to: "/post/$postId",
                params: { postId: row.id },
                search: () => ({}),
                hash: "",
              });
              const path = sitemapPathForLocation(router, location, postRouteId);
              if (path) entries.push({ path });
            }
          }
        }

        if (entries.length === 0) {
          return new Response(
            'No pages are included in this sitemap. Check route decisions and ancestor exclusions. Setting "exclude-subtree" on the root excludes the entire site.',
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }
        return new Response(sitemapXML(BASE_URL, entries), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
