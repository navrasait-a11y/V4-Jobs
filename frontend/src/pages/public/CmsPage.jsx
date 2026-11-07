import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui/feedback';
import { cmsApi } from '../../services';
import { formatDate } from '../../utils/format';
import useSeo from '../../hooks/useSeo';

/** About, privacy, terms and any other admin-managed page. */
const CmsPage = ({ slug: fixedSlug }) => {
  const params = useParams();
  const slug = fixedSlug || params.slug;
  const query = useQuery({ queryKey: ['cms-page', slug], queryFn: () => cmsApi.page(slug) });
  useSeo({
    title: query.data?.seo?.title || query.data?.title,
    description: query.data?.seo?.description || ((html) => String(html || '').replace(/<[^>]+>/g, ' '))(query.data?.content),
    image: query.data?.seo?.ogImage,
  });
  if (query.isPending) return <PageLoader />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-[800px] px-4 py-12">
        {query.error.status === 404 ? <EmptyState icon="description" title="This page is not published yet" /> : <ErrorState error={query.error} onRetry={query.refetch} />}
      </div>
    );
  }
  return (
    <article className="mx-auto max-w-[800px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">{query.data.title}</h1>
      {query.data.updatedAt && <p className="mt-1 text-xs text-brand-gray-muted">Last updated {formatDate(query.data.updatedAt)}</p>}
      {/* content is sanitised HTML from the API */}
      <div className="prose-content mt-6" dangerouslySetInnerHTML={{ __html: query.data.content }} />
    </article>
  );
};

export default CmsPage;
