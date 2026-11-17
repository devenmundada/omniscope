import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/welcome', '/methodology', '/demo', '/privacy'], disallow: ['/api/', '/auth/', '/report'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
