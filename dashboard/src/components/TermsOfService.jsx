import { ShieldAlert, BookOpen, UserCheck, Scale, AlertCircle, ArrowLeft } from 'lucide-react';

function TermsOfService() {
  const handleGoHome = () => {
    window.location.href = window.location.origin;
  };

  return (
    <div className="app-container landing-container" style={{ overflowY: 'auto', padding: '40px 20px', height: 'auto', minHeight: '100vh' }}>
      <div className="dynamic-bg" style={{ filter: 'blur(100px) brightness(0.4) saturate(1.2)', background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)', opacity: 0.15 }}></div>
      
      <div className="landing-content glass-panel" style={{ maxWidth: '800px', width: '100%', textAlign: 'left', alignItems: 'stretch', padding: '40px' }}>
        
        {/* Back Button */}
        <button 
          onClick={handleGoHome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-main)',
            padding: '10px 18px',
            borderRadius: '30px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'var(--transition)',
            marginBottom: '30px',
            width: 'fit-content'
          }}
          className="control-btn-back"
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        >
          <ArrowLeft size={16} />
          Retour à l'accueil
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
          <Scale size={42} style={{ color: 'var(--primary)' }} />
          <h1 style={{ margin: 0, fontSize: '36px', fontWeight: '800', letterSpacing: '-0.5px' }}>Conditions d'Utilisation</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '30px' }}>Dernière mise à jour : 31 Mai 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <BookOpen size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>1. Acceptation des Conditions</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              En ajoutant le bot Discord <strong>Foxy Music</strong> à votre serveur ou en accédant à son dashboard web via <a href="https://foxymusic.lunaverse.fr" style={{ color: 'var(--primary)', textDecoration: 'none' }}>foxymusic.lunaverse.fr</a>, vous acceptez pleinement et sans réserve les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser le service.
            </p>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <UserCheck size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>2. Utilisation du Service</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
              <strong>Foxy Music</strong> est un bot Discord destiné à la lecture et au contrôle de musique pour un usage strictement privé et personnel.
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Vous vous engagez à ne pas utiliser ce bot à des fins commerciales ou dans le but de diffuser publiquement des œuvres protégées par le droit d'auteur.</li>
              <li>Vous acceptez de ne pas surcharger, perturber ou pirater l'infrastructure sous-jacente du bot ou du dashboard.</li>
              <li>L'utilisation du bot doit respecter l'ensemble des conditions d'utilisation de Discord Inc.</li>
            </ul>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <ShieldAlert size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>3. Responsabilité & Garantie</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Le service est fourni "en l'état", sans aucune garantie de disponibilité constante ou d'absence totale d'erreurs. L'équipe de <strong>Foxy Music</strong> ne pourra être tenue responsable des interruptions de service temporaires dues à l'hébergement, aux API tierces (YouTube, Spotify, SoundCloud, etc.) ou à des pannes techniques.
            </p>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertCircle size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>4. Modification & Résiliation</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Nous nous réservons le droit de modifier ces conditions à tout moment pour les adapter aux évolutions techniques ou légales. En cas de non-respect de ces termes, nous nous réservons le droit de bloquer unilatéralement l'accès au service pour un utilisateur ou un serveur spécifique.
            </p>
          </section>

        </div>

        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          © 2026 Foxy Music. Tous droits réservés.
        </div>
      </div>
    </div>
  );
}

export default TermsOfService;
