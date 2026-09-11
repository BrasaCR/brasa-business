import { OPPORTUNITIES } from './opportunities.js';

const COPY = {
  en: {
    disclaimer: 'Informational pathway only. BRASA does not promise employment, customers, revenue, financing, certification, or eligibility.',
    steps: [
      ['understand', 'Understand the model', 'Learn how BRASA Business connects capabilities to practical business pathways.', '/business-how-this-works.html'],
      ['choose', 'Choose deliberately', 'Compare the work, tools, safety needs, and local conditions before deciding.', '/business-how-you-pick.html'],
      ['begin', 'Begin with a small step', 'Use the existing BRASA guide to plan a bounded first action.', '/business-how-to-begin.html'],
      ['review', 'Review earning considerations', 'Understand costs, demand, and uncertainty without treating examples as income promises.', '/business-how-you-earn.html']
    ]
  },
  es: {
    disclaimer: 'Ruta informativa únicamente. BRASA no promete empleo, clientes, ingresos, financiamiento, certificación ni elegibilidad.',
    steps: [
      ['understand', 'Comprenda el modelo', 'Conozca cómo BRASA Business conecta capacidades con rutas empresariales prácticas.', '/business-how-this-works.html'],
      ['choose', 'Elija deliberadamente', 'Compare el trabajo, las herramientas, la seguridad y las condiciones locales antes de decidir.', '/business-how-you-pick.html'],
      ['begin', 'Comience con un paso pequeño', 'Use la guía existente de BRASA para planificar una primera acción limitada.', '/business-how-to-begin.html'],
      ['review', 'Revise las consideraciones de ingresos', 'Considere costos, demanda e incertidumbre sin interpretar ejemplos como promesas de ingresos.', '/business-how-you-earn.html']
    ]
  }
};

export function businessExperience(id, requestedLocale = 'en') {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) return { error: 'invalid_experience_id', status: 400 };
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(requestedLocale)) return { error: 'invalid_locale', status: 400 };
  const pathway = OPPORTUNITIES.find((item) => item.id === id); if (!pathway) return { error: 'experience_not_found', status: 404 };
  const locale = requestedLocale.toLowerCase().startsWith('es') ? 'es' : 'en', copy = COPY[locale];
  return { data: { schemaVersion: 1, id: pathway.id, type: 'business-experience', title: pathway.title, locale, requestedLocale, pathwayUrl: pathway.url, providerPath: `/api/v1/experiences/${encodeURIComponent(pathway.id)}/providers`, capabilities: pathway.capabilities, countryCodes: pathway.countryCodes, offlineEligible: true, disclaimer: copy.disclaimer, steps: copy.steps.map(([stepId, title, description, url], index) => ({ id: stepId, position: index + 1, title, description, url })) } };
}
