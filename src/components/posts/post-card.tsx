import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle, Repeat2, Share, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import type { Post } from "@/lib/posts.functions";
import { LikeButton } from "./like-button";
import { RepostButton } from "./repost-button";
import { RepostModal } from "./repost-modal";
import { BookmarkButton } from "./bookmark-button";
import { PostContent } from "./post-content";
import { MediaGrid } from "./media-grid";


interface PostCardProps {
  post: Post;
  showReply?: boolean;
  onDelete?: (id: string) => void;
  onRepostChange?: () => void;
  onBookmarkChange?: () => void;
}

export function PostCard({ post, showReply = true, onDelete, onRepostChange, onBookmarkChange }: PostCardProps) {
  const { user } = useAuth();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const isOwner = user?.id === post.author?.id;

  if (!post.author) return null;

  const reposter = post.repost?.repostedBy;

  return (
    <article className="border-b border-border px-4 py-3 transition-colors hover:bg-muted/20">
      {reposter && (
        <div className="mb-1 flex items-center gap-2 pl-12 text-sm font-semibold text-muted-foreground">
          <Repeat2 className="h-4 w-4" />
          <Link to="/$username" params={{ username: reposter.username }} className="hover:underline">
            {user?.id === reposter.id ? "You" : reposter.display_name ?? reposter.username} reposted
          </Link>
        </div>
      )}

      {post.repost?.quote_content && (
        <p className="mb-2 whitespace-pre-wrap pl-12 text-[15px] leading-normal">{post.repost.quote_content}</p>
      )}

      <div className="flex gap-3">
        <Link to="/$username" params={{ username: post.author.username }} className="flex-shrink-0">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
            {post.author.avatar_url ? (
              <img src={post.author.avatar_url} alt={post.author.display_name ?? post.author.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(post.author.display_name ?? post.author.username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <Link
              to="/$username"
              params={{ username: post.author.username }}
              className="truncate font-bold hover:underline"
            >
              {post.author.display_name ?? post.author.username}
            </Link>
            {post.author.is_verified && (
              <svg className="h-4 w-4 flex-shrink-0 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
            <span className="truncate text-sm text-muted-foreground">@{post.author.username}</span>
            <span className="text-muted-foreground">·</span>
            <Link
              to="/post/$postId"
              params={{ postId: post.id }}
              className="text-sm text-muted-foreground hover:underline"
            >
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </Link>
          </div>

          <p className="mt-1 block whitespace-pre-wrap text-[15px] leading-normal">
            <PostContent content={post.content} />
          </p>


          {post.media_urls && post.media_urls.length > 0 && <MediaGrid media={post.media_urls} />}

          <div className="mt-3 flex max-w-md items-center justify-between text-muted-foreground">
            {showReply && (
              <Link
                to="/post/$postId"
                params={{ postId: post.id }}
                className="group flex items-center gap-2 transition-colors hover:text-primary"
              >
                <div className="rounded-full p-2 group-hover:bg-primary/10">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <span className="text-sm">{formatCount(post.reply_count)}</span>
              </Link>
            )}

            <RepostButton
              postId={post.id}
              initialCount={post.repost_count}
              onQuote={() => setQuoteOpen(true)}
              {...(onRepostChange ? { onChange: onRepostChange } : {})}
            />

            <LikeButton postId={post.id} initialLikes={post.like_count} />

            <BookmarkButton postId={post.id} {...(onBookmarkChange ? { onChange: onBookmarkChange } : {})} />

            <button className="group flex items-center gap-2 transition-colors hover:text-primary">
              <div className="rounded-full p-2 group-hover:bg-primary/10">
                <Share className="h-4 w-4" />
              </div>
            </button>

            {isOwner && onDelete && (
              <button
                onClick={() => onDelete(post.id)}
                className="group flex items-center gap-2 transition-colors hover:text-destructive"
              >
                <div className="rounded-full p-2 group-hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      <RepostModal
        post={post}
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        {...(onRepostChange ? { onSuccess: onRepostChange } : {})}
      />
    </article>
  );
}


function formatCount(n: number) {
  if (n === 0) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
