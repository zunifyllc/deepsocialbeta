# X Clone — Build Plan

## Overview
Build a dark-themed, X-style social web app on TanStack Start + Lovable Cloud.

## Phase 1 — Backend foundation
1. **Configure auth providers**
   - Enable email/password and Google sign-in via `supabase--configure_social_auth`.
   - Add `/auth` route with sign-in, sign-up, password-reset, and Google OAuth flow.
2. **Database schema (migrations)**
   - `profiles`: id (uuid, refs auth.users), username (unique), display_name, bio, avatar_url, banner_url, location, website, created_at, updated_at. Auto-created on signup via trigger.
   - `posts`: id (uuid), author_id, content (text), parent_post_id (self-reply), media_urls (text[]), created_at, updated_at.
   - `likes`: id, user_id, post_id, created_at. Unique (user_id, post_id).
   - `follows`: id, follower_id, following_id, created_at. Unique (follower_id, following_id).
   - `notifications`: id, user_id, actor_id, type (like/reply/follow), post_id, read_at, created_at.
3. **RLS + GRANTs**
   - Every public table gets GRANTs for `authenticated` and `service_role`.
   - Enable RLS on all tables.
   - Policies: users read/update own profile; read public profiles. Users create own posts/replies/likes/follows; delete own. Notifications scoped to recipient.
4. **Storage**
   - Create public `avatars` and `media` buckets.
   - RLS policies so users upload to own folder.

## Phase 2 — Server functions
Create thin `createServerFn` wrappers under `src/lib/`:
- `profiles.functions.ts`: getProfile, updateProfile, getProfileByUsername.
- `posts.functions.ts`: createPost, deletePost, getFeed, getPost, getReplies, getUserPosts.
- `likes.functions.ts`: toggleLike, getLikeStatus.
- `follows.functions.ts`: toggleFollow, getFollowStatus, getFollowCounts.
- `notifications.functions.ts`: getNotifications, markRead.

All authenticated functions use `requireSupabaseAuth`. Public reads use a server publishable client with narrow `TO anon` SELECT policies.

## Phase 3 — Routes & UI
Replace placeholder `src/routes/index.tsx` and add routes:
- `/` → landing or redirect to `/home` when signed in.
- `/auth` → sign-in / sign-up / password-reset.
- `/home` (under `_authenticated/`) → following + for-you tabs, composer, feed.
- `/explore` → public global feed.
- `/notifications` (auth) → notification list.
- `/messages` (auth) → placeholder DM list (UI only; full DMs out of scope unless requested).
- `/settings/profile` (auth) → edit profile, upload avatar/banner.
- `/$username` → public profile with posts, replies, likes, media tabs.
- `/post/$postId` → post detail with reply thread.

Shared chrome in `src/routes/__root.tsx`:
- Left sidebar nav (Home, Explore, Notifications, Messages, Profile, Settings).
- Right sidebar (search, trending, who-to-follow suggestions).
- Mobile bottom nav.

Components:
- `PostCard`, `PostComposer`, `ReplyThread`, `LikeButton`, `RepostButton`, `FollowButton`, `ProfileHeader`, `Sidebar`, `SearchBox`, `TrendingPanel`, `WhoToFollow`.

## Phase 4 — Design & polish
- Dark theme (`dark` class) with X-inspired colors: background `#000`, surface `#16181c`, border `#2f3336`, primary `#1d9bf0`, text `#e7e9ea`, muted `#71767b`.
- Use semantic tokens in `src/styles.css`; avoid hardcoded hex in components.
- Responsive layout: 3 columns on desktop, single feed on mobile.
- Realtime subscriptions for notifications and new posts on `/home`.

## Phase 5 — SEO / head metadata
- Unique `head()` for `/`, `/explore`, `/$username`, `/post/$postId`.
- Title + description + og/twitter tags. No root og:image; leaf routes with media use absolute image URL.

## Phase 6 — Verification
- Build passes (`vite build`).
- Typecheck passes (`tsgo` or `tsc --noEmit`).
- Manual preview checks: sign up, create post, like, reply, follow, view profile, upload avatar.

## Out of scope for first version
- Direct messaging backend (UI placeholder only).
- Reposts / quotes (kept as UI placeholder on cards).
- Search backend (search input navigates to explore).
- Advanced analytics or admin tools.

## Technical notes
- Use `createServerFn` from `@tanstack/react-start`; no Supabase Edge Functions.
- Authenticated routes live under `src/routes/_authenticated/` using the integration-managed layout.
- `src/start.ts` already registers `attachSupabaseAuth`; keep it.
- Use TanStack Query for loaders and mutations.
