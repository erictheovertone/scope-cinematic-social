import { Post, GridLayout } from '@/lib/types';

interface GridLayoutProps {
  posts: Post[];
  layout: GridLayout;
  className?: string;
}

export function PostsGrid({ posts, layout, className = '' }: GridLayoutProps) {
  const renderPost = (post: Post) => (
    <div key={post.id} className="relative group cursor-pointer">
      <img
        src={post.imageUrl}
        alt={post.title}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity duration-200">
        <div className="absolute bottom-0 left-0 right-0 p-4 text-[#E5E1DB] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <h3 className="font-mono text-sm font-bold">{post.title}</h3>
          <p className="font-mono text-xs text-gray-300 mt-1">{post.caption}</p>
        </div>
      </div>
    </div>
  );

  switch (layout) {
    case '2-across-16:9':
      return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-video">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );

    case '2-across-2.4:1':
      return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-[2.4/1]">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );

    case '1-across-16:9':
      return (
        <div className={`grid grid-cols-1 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-video">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );

    case '1-across-2.4:1':
      return (
        <div className={`grid grid-cols-1 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-[2.4/1]">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );

    case '3-across-4:3':
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-[4/3]">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );

    case 'collage':
      return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
          {posts.map((post, index) => {
            // Randomize aspect ratios for collage mode
            const aspectRatios = ['aspect-video', 'aspect-[2.4/1]', 'aspect-[4/3]', 'aspect-square'];
            const randomAspect = aspectRatios[index % aspectRatios.length];
            
            return (
              <div key={post.id} className={randomAspect}>
                {renderPost(post)}
              </div>
            );
          })}
        </div>
      );

    default:
      return (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
          {posts.map((post, index) => (
            <div key={post.id} className="aspect-[2.4/1]">
              {renderPost(post)}
            </div>
          ))}
        </div>
      );
  }
}
