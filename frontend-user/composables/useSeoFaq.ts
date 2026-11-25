/**
 * useSeoFaq — landing/topic FAQ items for the shared SeoFaq accordion.
 * Content lives in i18n (`seoFaq.<topic>[{ q, a, to }]`, all 4 locales) so
 * visible text and the FAQPage JSON-LD always come from the same strings.
 * Missing topics resolve to [] (SeoFaq renders nothing, no empty accordion).
 */
export interface SeoFaqItem {
  q: string
  a: string
  to?: string
}

export function useSeoFaq(topic: string) {
  const { t, te } = useI18n()
  return computed<SeoFaqItem[]>(() => {
    const items: SeoFaqItem[] = []
    for (let i = 0; i < 10; i++) {
      if (!te(`seoFaq.${topic}.${i}.q`)) break
      const toKey = `seoFaq.${topic}.${i}.to`
      items.push({
        q: t(`seoFaq.${topic}.${i}.q`),
        a: t(`seoFaq.${topic}.${i}.a`),
        ...(te(toKey) ? { to: t(toKey) } : {}),
      })
    }
    return items.filter((f) => f.q && f.a)
  })
}
