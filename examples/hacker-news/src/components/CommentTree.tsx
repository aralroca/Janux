import type { Comment } from '../data/stories';

/**
 * Static and recursive (0 KB of JS): the whole nested tree is rendered on the
 * server, and the hierarchy is the markup itself — a `.comment-tree` list
 * inside each parent `.comment`.
 */
export function CommentThread({ comments }: { comments: Comment[] }) {
  return (
    <ul class="comment-tree">
      {comments.map((comment) => (
        <li class="comment" key={comment.id}>
          <p class="comment-head">{comment.user}</p>
          <p class="comment-text">{comment.text}</p>
          {comment.replies.length > 0 ? <CommentThread comments={comment.replies} /> : null}
        </li>
      ))}
    </ul>
  );
}
