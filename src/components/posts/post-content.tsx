import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

const HASHTAG_PATTERN = /(#[A-Za-z0-9_]{2,50})/g;

/** Renders post text with #hashtags linked to the filtered explore feed. */
export function PostContent({ content }: { content: string }) {
  const parts = content.split(HASHTAG_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              to="/explore"
              search={{ hashtag: tag }}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
