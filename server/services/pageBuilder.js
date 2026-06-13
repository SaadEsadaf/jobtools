const { getDb } = require('../db');
const { generate } = require('./aiProvider');
const { signPayload } = require('./internalAuth');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const FR = {
  navFeatures: 'Fonctionnalités', navPlans: 'Offres', navFaq: 'FAQ',
  freeTrial: '✦ Essai Gratuit',
  heroBadge: '✦ Service IPTV Premium',
  heroDesc: 'Découvrez le streaming qualité cinéma avec plus de 25 000 chaînes en direct, qualité 4K HDR et activation instantanée sur tous vos appareils.',
  startTrial: '▶ Essai Gratuit',
  viewPlans: 'Voir les Offres →',
  liveChannels: 'Chaînes Live', ultraHd: 'Ultra HD', uptime: 'Garantie Uptime', instantSetup: 'Installation',
  whyUs: 'Pourquoi Nous Choisir', whyUsTitle: 'Tout ce dont vous avez besoin en un seul endroit',
  whyUsSub: 'Streaming Premium sans compromis. Du sport en direct aux films à succès, nous avons tout ce qu\'il vous faut.',
  features: ['📺 25 000+ Chaînes Live', 'Couverture mondiale avec sports, infos, divertissement et chaînes locales de tous les pays.', '🎯 Streaming 4K HDR', 'Image cristalline avec support HDR sur toutes les chaînes premium. Lecture fluide 60fps.', '⚡ Zéro Buffer', 'CDN professionnel avec 99.9% de disponibilité. Serveurs dédiés pour un streaming sans latence 24/7.', '📱 Tous les Appareils', 'Smart TV, Firestick, Android, iOS, PC, Mac, MAG — un abonnement pour toute la maison.', '🔒 Sécurisé & Privé', 'Connexions chiffrées, politique de non-conservation des logs et paiements anonymes.', '🎧 Support 24/7', 'Chat en direct avec de vrais humains. Temps de réponse moyen moins de 2 minutes.'],
  statsChannels: 'Chaînes dans le Monde', statsCustomers: 'Clients Satisfaits', statsUptime: 'Disponibilité', stats4k: 'Chaînes 4K',
  pricing: 'Tarifs', pricingTitle: 'Choisissez Votre Offre', pricingSub: 'Sélectionnez l\'offre parfaite pour vos besoins. Toutes incluent le support 24/7 et une garantie satisfait ou remboursé de 7 jours.',
  popular: 'Le Plus Populaire', getStarted: 'Commencer', subscribe: 'S\'abonner', bestValue: 'Meilleur Offre',
  testimonials: 'Témoignages', testimonialsTitle: 'Ce que disent nos clients', testimonialsSub: 'Rejoignez des milliers de téléspectateurs satisfaits.',
  t1Text: '"Enfin résilié le câble ! Plus de chaînes que mon fournisseur pour une fraction du prix. Les chaînes sport 4K sont incroyables."',
  t1Name: 'Karim M.', t1Title: 'Fan de sport, 2 ans',
  t2Text: '"Installation en moins de 5 minutes. Toute ma famille l\'utilise. La sélection de chaînes françaises est la meilleure que j\'ai trouvée."',
  t2Name: 'Sophie L.', t2Title: 'Forfait familial, 1 an',
  t3Text: '"J\'étais sceptique sur l\'IPTV mais l\'essai gratuit m\'a convaincu. Zéro buffer, qualité incroyable, et le support est super réactif."',
  t3Name: 'Thomas D.', t3Title: 'Utilisateur Premium, 6 mois',
  faq: 'FAQ', faqTitle: 'Questions Fréquentes', faqSub: 'Tout ce que vous devez savoir avant de commencer.',
  faq1Q: 'Qu\'est-ce que l\'IPTV ?', faq1A: 'L\'IPTV (Télévision par Protocole Internet) diffuse des chaînes TV en direct et du contenu à la demande via Internet au lieu du câble ou du satellite. Regardez sur n\'importe quel appareil avec une connexion Internet — Smart TV, Firestick, téléphone, tablette ou ordinateur.',
  faq2Q: 'Quels appareils sont supportés ?', faq2A: 'Nous supportons toutes les plateformes : Android TV, Amazon Firestick, iOS/Apple TV, Android, Smart TV (Samsung, LG, Sony), MAG, et PC/Mac via VLC ou des lecteurs IPTV comme TiviMate et IPTV Smarters.',
  faq3Q: 'Comment commencer ?', faq3A: 'Choisissez une offre, effectuez le paiement, et vous recevrez vos identifiants de connexion par email. Téléchargez une application IPTV, entrez vos identifiants, et commencez à regarder immédiatement. Installation moyenne en moins de 5 minutes.',
  faq4Q: 'Y a-t-il une garantie ?', faq4A: 'Absolument ! Nous offrons une garantie satisfait ou remboursé de 7 jours sur tous les forfaits payants. Si vous n\'êtes pas complètement satisfait, contactez le support sous 7 jours pour un remboursement intégral.',
  faq5Q: 'Proposez-vous un essai gratuit ?', faq5A: 'Oui ! Nous offrons un essai gratuit de 3 jours pour tester notre service sans risque. Discutez avec Alex, notre assistant commercial, pour obtenir votre essai. Aucune carte bancaire requise.',
  ctaTitle: 'Prêt à Commencer ?', ctaDesc: 'Rejoignez 50 000+ clients satisfaits. Commencez votre essai gratuit — sans engagement, sans risque.',
  footerDesc: 'Streaming IPTV Premium avec 25 000+ chaînes, qualité 4K, et activation instantanée.',
  footerQuick: 'Liens Rapides', footerSupport: 'Support', footerLegal: 'Légal',
  home: 'Accueil', freeTrial2: 'Essai Gratuit', emailUs: 'Nous Écrire', liveChat: 'Chat en Direct',
  helpCenter: 'Centre d\'Aide', tos: 'Conditions d\'Utilisation', privacy: 'Politique de Confidentialité', refund: 'Politique de Remboursement',
  rights: 'Tous droits réservés.',
  contactWhatsApp: 'Contactez-nous sur WhatsApp',
};

async function fetchPlansFromBusinessEngine(providerId, planId, websiteId) {
  const db = getDb();
  const bossUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'iptv_boss_url'").get()?.value || 'http://localhost:3001';

  let provider = null, plan = null;

  if (planId) {
    const sig = signPayload({});
    try {
      const res = await fetch(`${bossUrl}/api/internal/plan/${planId}`, {
        headers: { 'X-Engine-Signature': sig }
      });
      if (res.ok) plan = await res.json();
    } catch (e) {
      console.error('[PageBuilder] Failed to fetch plan:', e.message);
    }
  }

  if (providerId) {
    if (plan) {
      provider = { name: plan.provider_name, specialty: plan.specialty };
    } else {
      const sig = signPayload({});
      try {
        const url = `${bossUrl}/api/internal/plans${websiteId ? '?website_id=' + websiteId : ''}`;
        const res = await fetch(url, { headers: { 'X-Engine-Signature': sig } });
        if (res.ok) {
          const plans = await res.json();
          const match = plans.find(p => p.provider_id === providerId || p.id === providerId);
          if (match) provider = { name: match.provider_name, specialty: match.specialty };
        }
      } catch (e) {
        console.error('[PageBuilder] Failed to fetch plans:', e.message);
      }
    }
  }

  return { provider, plan };
}

function getSiteSettings(websiteId) {
  const db = getDb();
  if (websiteId) {
    const site = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
    if (site) {
      return {
        siteName: site.site_name || site.name,
        siteUrl: `https://${site.domain}`,
        supportEmail: 'support@' + site.domain,
      };
    }
  }
  const fallback = db.prepare("SELECT value FROM app_settings WHERE key = 'site_domain'").get();
  const domain = fallback?.value || 'dalletek.live';
  return {
    siteName: 'Dalletek',
    siteUrl: `https://${domain}`,
    supportEmail: `support@${domain}`,
  };
}

async function pushToPaymentEngine(pageData) {
  const db = getDb();
  const payUrl = db.prepare("SELECT value FROM app_settings WHERE key = 'payment_engine_url'").get()?.value || 'http://localhost:3004';
  try {
    const sig = signPayload(pageData);
    const res = await fetch(`${payUrl}/api/internal/landing-page`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Engine-Signature': sig,
      },
      body: JSON.stringify(pageData),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[PageBuilder] Payment Engine push failed:', res.status, text);
    } else {
      console.log('[PageBuilder] Pushed to Payment Engine:', pageData.slug);
    }
  } catch (e) {
    console.error('[PageBuilder] Payment Engine push error:', e.message);
  }
}

async function buildPage({ keyword, audience, providerId, planId, language, template, websiteId }) {
  const db = getDb();
  const slug = slugify(keyword);
  const lang = language || 'fr';

  websiteId = websiteId || 1;

  if (db.prepare('SELECT id FROM landing_pages WHERE slug = ? AND website_id = ?').get(slug, websiteId)) {
    return { error: 'A page with this slug already exists for this website' };
  }

  const { provider, plan } = await fetchPlansFromBusinessEngine(providerId, planId, websiteId);
  const { siteName, siteUrl, supportEmail } = getSiteSettings(websiteId);

  let html;
  const t = lang === 'fr' ? FR : null;

  try {
    const systemPrompt = 'You are a senior UI/UX designer at a premium streaming service like Netflix/Videoland. Generate complete, production-ready HTML pages with a stunning, cinematic dark theme.';
    const userContent = `Design a premium streaming landing page for keyword '${keyword}' targeting '${audience || 'general'}'. Style: Netflix/Videoland-grade dark theme, full-screen hero with gradient overlays, large typography, hover animations, card carousels, and smooth scroll transitions.

Requirements:
- Hero: Full-viewport with animated gradient background, massive heading (clamp 3-6rem), subtitle, two CTA buttons (primary + outline), floating content cards below
- Features: Icon grid with glassmorphism cards, hover lift effect, animated borders
- Plans: 3-tier pricing with feature comparison, "Most Popular" badge, per-month/year toggle
- Testimonials: Carousel with avatar, rating stars, quote marks
- Stats row: Animated counter numbers (channels, users, uptime, devices)
- FAQ: Accordion with smooth open/close, plus/minus icons
- Footer: Multi-column with links, social icons, newsletter input
- Chat widget script: <script src="/chat-widget.js"></script>
- Meta: SEO title + description in head
- All CSS inline in <style>, responsive, zero external dependencies

Return ONLY the raw HTML, no markdown.`;

    html = await generate(userContent, { system: systemPrompt, maxTokens: 4000 });
  } catch (e) {
    if (e.message !== 'AI_NOT_CONFIGURED') {
      console.error('[PageBuilder] AI error:', e.message);
    }
  }

  if (!html) {
    const provBlock = provider ? `
.provider-spotlight{background:linear-gradient(135deg,#00d4ff08,#00ff8808);border:1px solid #00d4ff22;border-radius:16px;padding:32px;margin:40px auto;max-width:600px;text-align:center;position:relative;overflow:hidden}
.provider-spotlight::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:conic-gradient(from 0deg,transparent,#00d4ff11,transparent,#00ff8811,transparent);animation:spin 8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.provider-spotlight h3{color:#00d4ff;font-size:20px;margin-bottom:8px;position:relative;z-index:1}
.provider-spotlight p{color:#a0a0a0;font-size:14px;position:relative;z-index:1}` : '';

    html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${keyword} — ${siteName}</title>
<meta name="description" content="Looking for ${keyword}? Join ${siteName} — 25,000+ channels, 4K quality, instant activation. Start your free trial today.">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;overflow-x:hidden}
.container{max-width:1200px;margin:0 auto;padding:0 24px}

/* ── Navigation ── */
.nav{position:sticky;top:0;background:#0a0a0acc;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid #ffffff12;z-index:100;padding:0 24px}
.nav-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;height:64px;gap:32px}
.nav-logo{font-size:20px;font-weight:800;color:#00d4ff;text-decoration:none;letter-spacing:-0.3px;white-space:nowrap}
.nav-links{display:flex;gap:28px;flex:1;justify-content:center}
.nav-links a{color:#a0a0a0;text-decoration:none;font-size:14px;font-weight:500;transition:color .2s;position:relative;padding:4px 0}
.nav-links a::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:2px;background:#00d4ff;transition:width .3s;border-radius:1px}
.nav-links a:hover{color:#fff}
.nav-links a:hover::after{width:100%}
.nav-cta{padding:8px 22px;background:#00d4ff;color:#000;border:none;border-radius:50px;font-weight:700;font-size:13px;cursor:pointer;transition:all .3s;text-decoration:none;white-space:nowrap}
.nav-cta:hover{box-shadow:0 4px 20px #00d4ff44}
.nav-hamburger{display:none;background:transparent;border:none;color:#fff;font-size:24px;cursor:pointer;padding:8px;margin-left:auto}
.nav-mobile{display:none;flex-direction:column;gap:12px;padding:12px 0 16px;border-top:1px solid #ffffff12}
.nav-mobile.open{display:flex}
.nav-mobile a{color:#a0a0a0;text-decoration:none;font-size:14px;padding:4px 0}
.nav-mobile a:hover{color:#fff}
@media(max-width:768px){
  .nav-links{display:none}
  .nav-cta.nav-desktop{display:none}
  .nav-hamburger{display:block}
}

/* ── Hero ── */
.hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden;padding:80px 24px}
.hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 50%,#00d4ff15 0%,transparent 60%),radial-gradient(ellipse at 70% 50%,#00ff8815 0%,transparent 60%),radial-gradient(ellipse at 50% 0%,#00d4ff08 0%,transparent 50%);z-index:0}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:60px 60px;z-index:0;mask-image:radial-gradient(ellipse at center,black 30%,transparent 70%);-webkit-mask-image:radial-gradient(ellipse at center,black 30%,transparent 70%)}
.hero-content{position:relative;z-index:1;max-width:900px}
.hero-badge{display:inline-block;padding:6px 16px;border-radius:20px;background:#00d4ff15;border:1px solid #00d4ff33;color:#00d4ff;font-size:13px;font-weight:600;margin-bottom:24px;letter-spacing:0.5px}
.hero h1{font-size:clamp(2.5rem,6vw,5rem);font-weight:800;line-height:1.1;margin-bottom:20px;background:linear-gradient(135deg,#fff 30%,#00d4ff 70%,#00ff88);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:clamp(1rem,1.8vw,1.25rem);color:#999;max-width:640px;margin:0 auto 36px}
.hero-buttons{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn-primary{display:inline-flex;align-items:center;gap:8px;padding:14px 36px;background:#00d4ff;color:#000;border-radius:50px;text-decoration:none;font-weight:700;font-size:16px;transition:all .3s;border:none;cursor:pointer}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px #00d4ff44}
.btn-outline{display:inline-flex;align-items:center;gap:8px;padding:14px 36px;background:transparent;color:#fff;border-radius:50px;text-decoration:none;font-weight:600;font-size:16px;border:1.5px solid #ffffff33;transition:all .3s;cursor:pointer}
.btn-outline:hover{border-color:#00d4ff;color:#00d4ff;transform:translateY(-2px)}
.hero-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-top:60px;max-width:700px;margin-left:auto;margin-right:auto;width:100%}
.hero-card{background:#ffffff08;border:1px solid #ffffff15;border-radius:12px;padding:20px 16px;text-align:center;backdrop-filter:blur(12px);transition:all .3s}
.hero-card:hover{background:#ffffff12;transform:translateY(-4px);border-color:#00d4ff33}
.hero-card .num{font-size:28px;font-weight:800;color:#00d4ff;display:block}
.hero-card .lbl{font-size:12px;color:#666;margin-top:4px}

/* ── Sections ── */
section{padding:80px 0}
.section-label{display:inline-block;padding:4px 14px;border-radius:20px;background:#00d4ff10;color:#00d4ff;font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px}
.section-title{font-size:clamp(1.6rem,3vw,2.5rem);font-weight:800;text-align:center;margin-bottom:12px}
.section-sub{text-align:center;color:#666;font-size:15px;max-width:600px;margin:0 auto 48px}

/* ── Features ── */
.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.feature-card{background:linear-gradient(145deg,#ffffff08,#ffffff04);border:1px solid #ffffff12;border-radius:16px;padding:28px 24px;transition:all .4s;position:relative;overflow:hidden}
.feature-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00d4ff44,transparent);transform:scaleX(0);transition:transform .4s}
.feature-card:hover{transform:translateY(-6px);border-color:#ffffff22;background:linear-gradient(145deg,#ffffff10,#ffffff06)}
.feature-card:hover::before{transform:scaleX(1)}
.feature-card .icon{font-size:32px;margin-bottom:16px;display:block}
.feature-card h3{font-size:17px;font-weight:700;margin-bottom:8px}
.feature-card p{color:#888;font-size:14px;line-height:1.6}

/* ── Plans ── */
.plans-bg{background:linear-gradient(180deg,#0a0a0a,#0f0f0f,#0a0a0a)}
.plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:24px;max-width:1000px;margin:0 auto}
.plan-card{background:linear-gradient(145deg,#ffffff08,#ffffff04);border:1px solid #ffffff15;border-radius:20px;padding:36px 28px;text-align:center;transition:all .4s;position:relative}
.plan-card:hover{transform:translateY(-8px);border-color:#ffffff25}
.plan-card.popular{border-color:#00d4ff44;background:linear-gradient(145deg,#00d4ff08,#00d4ff04)}
.plan-card.popular .popular-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#00d4ff;color:#000;padding:4px 20px;border-radius:20px;font-size:12px;font-weight:700}
.plan-card .plan-name{font-size:18px;font-weight:700;margin-bottom:4px}
.plan-card .plan-desc{color:#888;font-size:13px;margin-bottom:20px}
.plan-card .price{font-size:42px;font-weight:800;color:#fff}
.plan-card .price span{font-size:16px;color:#666;font-weight:400}
.plan-card .plan-features{list-style:none;margin:24px 0;text-align:left}
.plan-card .plan-features li{padding:10px 0;border-bottom:1px solid #ffffff08;color:#aaa;font-size:14px;display:flex;align-items:center;gap:10px}
.plan-card .plan-features li::before{content:'✓';color:#00d4ff;font-weight:700}
.plan-card .plan-btn{display:block;width:100%;padding:14px;border-radius:50px;border:none;font-weight:700;font-size:15px;cursor:pointer;transition:all .3s;margin-top:16px;text-decoration:none}
.plan-card .plan-btn.primary{background:#00d4ff;color:#000}
.plan-card .plan-btn.primary:hover{box-shadow:0 4px 20px #00d4ff44;transform:translateY(-2px)}
.plan-card .plan-btn.outline{background:transparent;color:#fff;border:1.5px solid #ffffff33}
.plan-card .plan-btn.outline:hover{border-color:#00d4ff;color:#00d4ff}

/* ── Testimonials ── */
.testimonials-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.testimonial-card{background:linear-gradient(145deg,#ffffff08,#ffffff04);border:1px solid #ffffff12;border-radius:16px;padding:28px;transition:all .3s}
.testimonial-card:hover{transform:translateY(-4px);border-color:#ffffff22}
.testimonial-card .stars{color:#ffaa00;font-size:14px;margin-bottom:12px}
.testimonial-card .quote{color:#ccc;font-size:14px;line-height:1.7;margin-bottom:16px;font-style:italic}
.testimonial-card .author{display:flex;align-items:center;gap:12px}
.testimonial-card .author-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#00ff88);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#000}
.testimonial-card .author-name{font-size:14px;font-weight:600}
.testimonial-card .author-title{font-size:12px;color:#666}

/* ── FAQ ── */
.faq-list{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:8px}
.faq-item{background:#ffffff08;border:1px solid #ffffff12;border-radius:12px;overflow:hidden;transition:all .3s}
.faq-item.active{border-color:#00d4ff33}
.faq-q{padding:18px 20px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-weight:600;font-size:15px;color:#ddd;user-select:none}
.faq-q:hover{color:#fff}
.faq-q .icon{font-size:18px;color:#666;transition:transform .3s;flex-shrink:0}
.faq-item.active .faq-q .icon{transform:rotate(45deg);color:#00d4ff}
.faq-a{padding:0 20px;max-height:0;overflow:hidden;transition:all .3s;color:#888;font-size:14px;line-height:1.7}
.faq-item.active .faq-a{max-height:300px;padding:0 20px 18px}

/* ── Stats ── */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;max-width:900px;margin:0 auto}
.stat-card{text-align:center;padding:32px 20px;background:linear-gradient(145deg,#ffffff06,#ffffff02);border:1px solid #ffffff10;border-radius:16px;transition:all .3s}
.stat-card:hover{background:#ffffff08;border-color:#ffffff20}
.stat-card .num{font-size:36px;font-weight:800;color:#00d4ff;display:block}
.stat-card .lbl{color:#666;font-size:13px;margin-top:6px}

/* ── CTA Banner ── */
.cta-banner{background:linear-gradient(135deg,#00d4ff10,#00ff8810);border:1px solid #00d4ff22;border-radius:24px;padding:60px 40px;text-align:center;position:relative;overflow:hidden}
.cta-banner::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 50% 50%,#00d4ff08,transparent 60%);animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
.cta-banner h2{font-size:clamp(1.5rem,2.5vw,2.2rem);font-weight:800;margin-bottom:12px;position:relative;z-index:1}
.cta-banner p{color:#999;margin-bottom:28px;position:relative;z-index:1}
.cta-banner .btn-primary{position:relative;z-index:1}

/* ── Footer ── */
footer{background:#080808;border-top:1px solid #ffffff08;padding:60px 24px 30px}
.footer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:40px;margin-bottom:40px}
footer h4{color:#fff;font-size:14px;font-weight:700;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px}
footer a{display:block;color:#666;text-decoration:none;font-size:14px;padding:4px 0;transition:color .3s}
footer a:hover{color:#00d4ff}
.footer-bottom{border-top:1px solid #ffffff08;padding-top:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;color:#555;font-size:13px}
.footer-socials{display:flex;gap:12px}
.footer-socials a{width:36px;height:36px;border-radius:50%;background:#ffffff08;display:flex;align-items:center;justify-content:center;font-size:16px;padding:0;transition:all .3s}
.footer-socials a:hover{background:#00d4ff20;color:#00d4ff}
${provBlock}

/* ── Responsive ── */
@media(max-width:768px){
  .hero{padding:60px 20px;min-height:auto}
  .hero h1{font-size:clamp(2rem,8vw,3rem)}
  .hero-cards{grid-template-columns:repeat(2,1fr);margin-top:40px}
  section{padding:50px 0}
  .plan-grid{grid-template-columns:1fr;max-width:400px}
  .cta-banner{padding:40px 24px}
  footer .footer-grid{grid-template-columns:repeat(2,1fr)}
  .footer-bottom{flex-direction:column;text-align:center}
}

/* ── Animations ── */
.fade-up{opacity:0;transform:translateY(30px);transition:all .6s}
.fade-up.visible{opacity:1;transform:translateY(0)}
</style>
</head>
<body>

<!-- Navigation -->
<nav class="nav">
  <div class="nav-inner">
    <a href="${siteUrl}" class="nav-logo">${siteName}</a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#plans">Plans</a>
      <a href="#faq">FAQ</a>
    </div>
    <a href="${siteUrl}" class="nav-cta nav-desktop">✦ Free Trial</a>
    <button class="nav-hamburger" onclick="document.querySelector('.nav-mobile').classList.toggle('open')">☰</button>
  </div>
  <div class="nav-mobile">
    <a href="#features" onclick="document.querySelector('.nav-mobile').classList.remove('open')">Features</a>
    <a href="#plans" onclick="document.querySelector('.nav-mobile').classList.remove('open')">Plans</a>
    <a href="#faq" onclick="document.querySelector('.nav-mobile').classList.remove('open')">FAQ</a>
    <a href="${siteUrl}" class="nav-cta" style="text-align:center;margin-top:4px">✦ Free Trial</a>
  </div>
</nav>

<!-- Hero -->
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-grid"></div>
  <div class="hero-content">
    <span class="hero-badge">✦ Premium IPTV Service</span>
    <h1>${keyword}</h1>
    <p>Experience cinema-grade streaming with 25,000+ live channels, 4K HDR quality, and instant activation on any device.</p>
    <div class="hero-buttons">
      <a href="${siteUrl}" class="btn-primary">▶ Start Free Trial</a>
      <a href="${siteUrl}" class="btn-outline">View Plans →</a>
    </div>
    <div class="hero-cards">
      <div class="hero-card"><span class="num">25K+</span><span class="lbl">Live Channels</span></div>
      <div class="hero-card"><span class="num">4K</span><span class="lbl">Ultra HD Quality</span></div>
      <div class="hero-card"><span class="num">99.9%</span><span class="lbl">Uptime Guarantee</span></div>
      <div class="hero-card"><span class="num">5min</span><span class="lbl">Instant Setup</span></div>
    </div>
  </div>
</section>

${provider ? `
<!-- Provider Spotlight -->
<div class="container">
  <div class="provider-spotlight">
    <h3>⭐ Featured Provider: ${provider.name}</h3>
    <p>${provider.specialty || 'Premium IPTV Content'}</p>
    ${plan ? `<p style="color:#fff;font-size:18px;font-weight:700;margin-top:12px;position:relative;z-index:1">${plan.plan_name} — $${plan.price_sell}/${plan.duration_days}d · ${plan.channels} channels · ${plan.streams} stream</p>` : ''}
    <a href="${siteUrl}" class="btn-primary" style="margin-top:16px;position:relative;z-index:1">Get This Plan</a>
  </div>
</div>` : ''}

<!-- Features -->
<section>
  <div class="container">
    <div style="text-align:center"><span class="section-label">Why Choose Us</span></div>
    <h2 class="section-title">Everything You Need in One Place</h2>
    <p class="section-sub">Premium streaming with zero compromises. From live sports to blockbuster movies, we've got you covered.</p>
    <div class="features-grid">
      <div class="feature-card fade-up"><span class="icon">📺</span><h3>25,000+ Live Channels</h3><p>Global coverage with sports, news, entertainment, and local channels from every country.</p></div>
      <div class="feature-card fade-up"><span class="icon">🎯</span><h3>4K HDR Streaming</h3><p>Crystal-clear picture with HDR support on all premium channels. 60fps smooth playback.</p></div>
      <div class="feature-card fade-up"><span class="icon">⚡</span><h3>Zero Buffering</h3><p>Enterprise CDN with 99.9% uptime. Dedicated servers ensure lag-free streaming 24/7.</p></div>
      <div class="feature-card fade-up"><span class="icon">📱</span><h3>All Devices</h3><p>Smart TV, Firestick, Android, iOS, PC, Mac, MAG — one subscription covers your whole home.</p></div>
      <div class="feature-card fade-up"><span class="icon">🔒</span><h3>Secure & Private</h3><p>Encrypted connections, no logs policy, and anonymous payment options for complete privacy.</p></div>
      <div class="feature-card fade-up"><span class="icon">🎧</span><h3>24/7 Support</h3><p>Live chat support with real humans. Average response time under 2 minutes.</p></div>
    </div>
  </div>
</section>

<!-- Stats -->
<section style="padding:40px 0">
  <div class="container">
    <div class="stats-row">
      <div class="stat-card fade-up"><span class="num">25K+</span><span class="lbl">Channels Worldwide</span></div>
      <div class="stat-card fade-up"><span class="num">50K+</span><span class="lbl">Happy Customers</span></div>
      <div class="stat-card fade-up"><span class="num">99.9%</span><span class="lbl">Service Uptime</span></div>
      <div class="stat-card fade-up"><span class="num">5K+</span><span class="lbl">4K Channels</span></div>
    </div>
  </div>
</section>

<!-- Plans -->
<section class="plans-bg">
  <div class="container">
    <div style="text-align:center"><span class="section-label">Pricing</span></div>
    <h2 class="section-title">Choose Your Plan</h2>
    <p class="section-sub">Pick the perfect plan for your needs. All plans include 24/7 support and a 7-day money-back guarantee.</p>
    <div class="plan-grid">
      <div class="plan-card fade-up">
        <div class="plan-name">Basic</div>
        <div class="plan-desc">Perfect for getting started</div>
        <div class="price">$9.99 <span>/mo</span></div>
        <ul class="plan-features">
          <li>12,000+ live channels</li>
          <li>1 simultaneous stream</li>
          <li>HD quality</li>
          <li>Email support</li>
          <li>7-day money-back</li>
        </ul>
        <a href="${siteUrl}" class="plan-btn outline">Get Started</a>
      </div>
      <div class="plan-card popular fade-up">
        <div class="popular-badge">Most Popular</div>
        <div class="plan-name">Premium</div>
        <div class="plan-desc">Best value for families</div>
        <div class="price">$19.99 <span>/mo</span></div>
        <ul class="plan-features">
          <li>20,000+ live channels</li>
          <li>2 simultaneous streams</li>
          <li>Full 4K HDR quality</li>
          <li>Priority support</li>
          <li>7-day money-back</li>
        </ul>
        <a href="${siteUrl}" class="plan-btn primary">Subscribe Now</a>
      </div>
      <div class="plan-card fade-up">
        <div class="plan-name">Ultimate</div>
        <div class="plan-desc">Unlimited everything</div>
        <div class="price">$79.99 <span>/yr</span></div>
        <ul class="plan-features">
          <li>25,000+ live channels</li>
          <li>4 simultaneous streams</li>
          <li>Full 4K HDR quality</li>
          <li>24/7 priority support</li>
          <li>Best value — save 66%</li>
        </ul>
        <a href="${siteUrl}" class="plan-btn outline">Best Value</a>
      </div>
    </div>
  </div>
</section>

<!-- Testimonials -->
<section>
  <div class="container">
    <div style="text-align:center"><span class="section-label">Testimonials</span></div>
    <h2 class="section-title">What Our Customers Say</h2>
    <p class="section-sub">Join thousands of satisfied viewers who made the switch to premium IPTV.</p>
    <div class="testimonials-grid">
      <div class="testimonial-card fade-up">
        <div class="stars">★★★★★</div>
        <p class="quote">"Finally cut the cord! Better channels than my cable provider at a fraction of the cost. The 4K sports channels are incredible."</p>
        <div class="author">
          <div class="author-avatar">M</div>
          <div><div class="author-name">Mike R.</div><div class="author-title">Sports fan, 2 years</div></div>
        </div>
      </div>
      <div class="testimonial-card fade-up">
        <div class="stars">★★★★★</div>
        <p class="quote">"Setup took less than 5 minutes. My whole family uses it on different devices. Arabic channel selection is the best I've found."</p>
        <div class="author">
          <div class="author-avatar">L</div>
          <div><div class="author-name">Layla H.</div><div class="author-title">Family plan, 1 year</div></div>
        </div>
      </div>
      <div class="testimonial-card fade-up">
        <div class="stars">★★★★★</div>
        <p class="quote">"I was skeptical about IPTV but the free trial convinced me. Zero buffering, amazing picture quality, and support is super responsive."</p>
        <div class="author">
          <div class="author-avatar">D</div>
          <div><div class="author-name">David K.</div><div class="author-title">Premium user, 6 months</div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section style="padding:40px 0">
  <div class="container">
    <div style="text-align:center"><span class="section-label">FAQ</span></div>
    <h2 class="section-title">Frequently Asked Questions</h2>
    <p class="section-sub">Everything you need to know before getting started.</p>
    <div class="faq-list">
      <div class="faq-item active">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('active')">What is IPTV? <span class="icon">+</span></div>
        <div class="faq-a">IPTV (Internet Protocol Television) delivers live TV channels and on-demand content over the internet instead of traditional cable or satellite. Watch on any device with an internet connection — Smart TV, Firestick, phone, tablet, or computer.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('active')">Which devices are supported? <span class="icon">+</span></div>
        <div class="faq-a">We support all major platforms: Android TV, Amazon Firestick, iOS/Apple TV, Android phones/tablets, Smart TVs (Samsung, LG, Sony), MAG boxes, and PC/Mac via VLC or IPTV players like TiviMate and IPTV Smarters.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('active')">How do I get started? <span class="icon">+</span></div>
        <div class="faq-a">Choose a plan, complete payment, and you'll receive your login credentials instantly via email. Download an IPTV player app, enter your credentials, and start watching immediately. Average setup time is under 5 minutes.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('active')">Is there a money-back guarantee? <span class="icon">+</span></div>
        <div class="faq-a">Absolutely! We offer a 7-day money-back guarantee on all paid plans. If you're not completely satisfied, contact support within 7 days for a full refund — no questions asked.</div>
      </div>
      <div class="faq-item">
        <div class="faq-q" onclick="this.parentElement.classList.toggle('active')">Do you offer a free trial? <span class="icon">+</span></div>
        <div class="faq-a">Yes! We offer a 3-day free trial so you can test our service risk-free. Chat with Alex, our sales assistant, to get your trial set up instantly. No credit card required.</div>
      </div>
    </div>
  </div>
</section>

<!-- CTA Banner -->
<section style="padding:20px 0 80px">
  <div class="container">
    <div class="cta-banner fade-up">
      <h2>Ready to Start Watching?</h2>
      <p>Join 50,000+ satisfied customers. Start your free trial today — no commitment, no risk.</p>
      <a href="${siteUrl}" class="btn-primary">▶ Start Free Trial</a>
    </div>
  </div>
</section>

<!-- Footer -->
<footer>
  <div class="container">
    <div class="footer-grid">
      <div>
        <h4>${siteName}</h4>
        <p style="color:#666;font-size:14px;line-height:1.7">Premium IPTV streaming with 25,000+ channels, 4K quality, and instant activation.</p>
      </div>
      <div>
        <h4>Quick Links</h4>
        <a href="${siteUrl}">Home</a>
        <a href="${siteUrl}/#plans">Plans</a>
        <a href="${siteUrl}/#faq">FAQ</a>
        <a href="${siteUrl}">Free Trial</a>
      </div>
      <div>
        <h4>Support</h4>
        <a href="mailto:${supportEmail}">Email Us</a>
        <a href="${siteUrl}">Live Chat</a>
        <a href="${siteUrl}">Help Center</a>
      </div>
      <div>
        <h4>Legal</h4>
        <a href="${siteUrl}">Terms of Service</a>
        <a href="${siteUrl}">Privacy Policy</a>
        <a href="${siteUrl}">Refund Policy</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</span>
      <div class="footer-socials">
        <a href="#">𝕏</a>
        <a href="#">📺</a>
        <a href="#">💬</a>
      </div>
    </div>
  </div>
</footer>

<script src="/chat-widget.js"></script>
<script>
document.addEventListener('DOMContentLoaded',()=>{
  const observer=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting&&(e.target.classList.add('visible'),observer.unobserve(e.target))})},{threshold:.1});
  document.querySelectorAll('.fade-up').forEach(e=>observer.observe(e));
});
</script>
</body>
</html>`;
  }

  const title = keyword.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  const result = db.prepare(
    'INSERT INTO landing_pages (title, slug, keyword, audience, html_content, language, website_id, provider_id, plan_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(title, slug, keyword, audience || null, html, lang, websiteId, providerId || null, planId || null);

  db.prepare(
    'INSERT INTO agent_log (agent, action, details) VALUES (?, ?, ?)'
  ).run('PageBuilder', 'page_created', `Landing page "${title}" (${slug}) created${providerId ? ' with provider ' + providerId : ''} for website #${websiteId}`);

  db.prepare(
    'INSERT INTO seo_log (run_type, action, keyword, details, status) VALUES (?, ?, ?, ?, ?)'
  ).run('page_build', 'built', keyword, `Page created for "${keyword}" targeting "${audience || 'general'}"`, 'completed');

  // Push to Payment Engine for cloaking/redirection
  pushToPaymentEngine({
    website_id: websiteId,
    title,
    slug,
    keyword,
    audience: audience || null,
    html_content: html,
    language: lang,
  }).catch(e => console.error('[PageBuilder] Push failed:', e.message));

  return { id: result.lastInsertRowid, slug, title };
}

module.exports = { buildPage, slugify };
