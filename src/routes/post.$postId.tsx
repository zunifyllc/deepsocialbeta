import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/posts/post-card";
import { PostComposer } from "@/components/posts/post-composer";
import { getPost, getReplies, deletePost } from "@/lib/posts.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/post/$postId")({
  head: () => ({
    meta: [
      { title: "Post / DeepSocial" },
      { name: "description", content: "View post on DeepSocial." },
      { property: "og:title", content: "Post / DeepSocial" },
      { property: "og:description", content: "View post on DeepSocial." },
    ],
  }),
  loader: async ({ params, context }) => {
    const post = await getPost({ data: { postId: params.postId } });
    if (!post) throw notFound();
    await context.queryClient.ensureQueryData(repliesQueryOptions(params.postId));
    return { post };
  },
  component: PostDetailPage,
});

const repliesQueryOptions = (postId: string) => ({
  queryKey: ["replies", postId],
  queryFn: () => getReplies({ data: { postId } }),
});

function PostDetailPage() {
  const { post } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const { data: replies } = useSuspenseQuery(repliesQueryOptions(post.id));
  const remove = useServerFn(deletePost);
  const { user } = useAuth();
  const recordImpression = useServerFn(recordPostImpression);

  useEffect(() => {
    if (!user || user.id === post.author?.id) return;
    recordImpression({ data: { postId: post.id } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, post.id]);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["replies", post.id] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md">
        <Link to="/home" className="rounded-full p-2 transition-colors hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Post</h1>
      </div>

      <PostCard post={post} showReply={false} onDelete={handleDelete} />

      <div className="border-b border-border">
        <PostComposer
          parentPostId={post.id}
          placeholder="Post your reply"
          buttonText="Reply"
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["replies", post.id] })}
        />
      </div>

      <div>
        {replies?.map((reply) => (
          <PostCard key={reply.id} post={reply} onDelete={handleDelete} />
        ))}
        {replies?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">No replies yet</p>
            <p className="mt-2">Be the first to reply.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
