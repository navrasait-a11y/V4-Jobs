import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BlogCard } from './Home';
import ShareMenu from '../../components/common/ShareMenu';
import { Avatar, Pagination, SearchInput } from '../../components/ui/data';
import { CardSkeleton, EmptyState, ErrorState, PageLoader } from '../../components/ui/feedback';
import { useUrlFilters } from '../../hooks/useData';
import useDebounce from '../../hooks/useDebounce';
import { cmsApi } from '../../services';
import { formatDate } from '../../utils/format';
import useSeo from '../../hooks/useSeo';
import AdSlot from '../../components/common/AdSlot';

export const CareerAdvice = () => {
  useSeo({ title: 'Career advice and job tips', description: 'Resume tips, interview preparation and career guidance from the Freejobwala team.', path: '/career-advice' });
  const [filters, setFilters] = useUrlFilters({ page: '1' });
  const [q, setQ] = useState(filters.q || '');
  const debounced = useDebounce(q, 400);
  useEffect(() => {
    if (debounced !== (filters.q || '')) setFilters({ q: debounced });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { limit: 12, ...filters };
  const query = useQuery({ queryKey: ['blogs', params], queryFn: () => cmsApi.blogs(params), placeholderData: keepPreviousData });

  return (
    <div className="bg-brand-tint">
      <div className="border-b border-brand-border bg-white">
        <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">Career Advice</h1>
          <p className="mt-1 text-sm text-brand-gray">Guides on resumes, interviews and career growth</p>
          <SearchInput className="mt-4 max-w-md" value={q} onChange={setQ} placeholder="Search articles" />
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        {query.isPending && <CardSkeleton />}
        <AdSlot placement="career_advice" className="mb-4" />
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.data && !query.data.data.length && <EmptyState icon="article" title="No articles yet" description="New guides will appear here." />}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.data.map((b) => (
            <BlogCard key={b._id} blog={b} />
          ))}
        </div>
        <Pagination meta={query.data?.meta} onPage={(page) => setFilters({ page })} />
      </div>
    </div>
  );
};

export const CareerAdviceDetail = () => {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['blog', id], queryFn: () => cmsApi.blog(id) });
  const blog = query.data?.blog || query.data;
  const seoText = ((html) => String(html || '').replace(/<[^>]+>/g, ' '))(blog?.excerpt || blog?.content);
  useSeo({
    title: blog?.seo?.title || blog?.title,
    description: blog?.seo?.description || seoText,
    image: blog?.seo?.ogImage || blog?.coverImage?.url,
    type: 'article',
    jsonLd: blog
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: blog.title,
          image: blog.coverImage?.url ? [blog.coverImage.url] : undefined,
          datePublished: blog.publishedAt,
          dateModified: blog.updatedAt || blog.publishedAt,
          author: { '@type': 'Person', name: blog.author?.admin?.nickname || 'Freejobwala' },
          publisher: { '@type': 'Organization', name: 'Freejobwala' },
        }
      : undefined,
  });
  if (query.isPending) return <PageLoader />;
  if (query.isError) return <div className="mx-auto max-w-[800px] p-6"><ErrorState error={query.error} onRetry={query.refetch} /></div>;
  const author = blog.author?.admin;
  const related = query.data.related || blog.related || [];
  return (
    <article className="mx-auto max-w-[800px] px-4 py-8 sm:px-6">
      <Link to="/career-advice" className="text-sm font-medium text-brand-blue hover:underline">
        ← All articles
      </Link>
      {blog.category && <p className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-orange">{blog.category}</p>}
      <h1 className="mt-1 text-2xl font-bold leading-snug text-brand-dark sm:text-4xl">{blog.title}</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={author?.nickname || 'Freejobwala'} src={blog.author?.avatar?.url} size={36} />
          <div className="text-xs text-brand-gray">
            <p className="font-semibold text-brand-dark">{author?.nickname || 'Freejobwala'}</p>
            <p>{[author?.designation, formatDate(blog.publishedAt)].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <ShareMenu load={async () => query.data.share || blog.share || cmsApi.share(window.location.href, blog.title)} />
      </div>
      {blog.coverImage?.url && <img src={blog.coverImage.url} alt="" className="mt-5 w-full rounded-xl" />}
      {/* content is sanitised HTML from the API */}
      <div className="prose-content mt-6" dangerouslySetInnerHTML={{ __html: blog.content }} />
      {related.length > 0 && (
        <section className="mt-10 border-t border-brand-border pt-6">
          <h2 className="mb-4 font-bold text-brand-dark">Related articles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {related.slice(0, 2).map((b) => (
              <BlogCard key={b._id} blog={b} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
};
