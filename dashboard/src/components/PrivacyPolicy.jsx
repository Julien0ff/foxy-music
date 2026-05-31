import { Shield, Eye, Database, Share2, HelpCircle, ArrowLeft } from 'lucide-react';

function PrivacyPolicy() {
  const handleGoHome = () => {
    window.location.href = window.location.origin;
  };

  return (
    <div style={{ 
      overflowY: 'auto', 
      padding: '60px 20px', 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      position: 'relative',
      zIndex: 1
    }}>
      <div className="dynamic-bg" style={{ filter: 'blur(100px) brightness(0.4) saturate(1.2)', background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)', opacity: 0.15, top: 0, left: 0, width: '100%', height: '100%' }}></div>
      
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
          <Shield size={42} style={{ color: 'var(--primary)' }} />
          <h1 style={{ margin: 0, fontSize: '36px', fontWeight: '800', letterSpacing: '-0.5px' }}>Politique de Confidentialité</h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '30px' }}>Dernière mise à jour : 31 Mai 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Eye size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>1. Données Collectées</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
              Dans le but exclusif de faire fonctionner le bot et son interface de contrôle (dashboard), <strong>Foxy Music</strong> traite uniquement les données techniques publiques fournies par l'API Discord :
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Vos identifiants Discord publics :</strong> Identifiant numérique (ID), nom d'utilisateur et image de profil (avatar).</li>
              <li><strong>Informations sur vos serveurs :</strong> L'ID et le nom de vos serveurs où le bot est installé, pour afficher les contrôles uniquement aux membres autorisés.</li>
              <li><strong>Données de salon vocal :</strong> La liste et le statut des salons vocaux où le bot est connecté pour synchroniser la lecture de musique.</li>
            </ul>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Database size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>2. Utilisation et Stockage des Données</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '10px' }}>
              Toutes les connexions utilisateur au dashboard se font via le protocole officiel OAuth2 de Discord. 
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li><strong>Pas de mots de passe :</strong> Nous ne collectons, ne voyons et ne stockons jamais vos mots de passe ou informations d'identification Discord.</li>
              <li><strong>Stockage local temporaire :</strong> Votre jeton d'accès temporaire Discord (token OAuth2) est sauvegardé localement dans votre propre navigateur (via <code>localStorage</code>) pour maintenir votre session ouverte.</li>
              <li><strong>Database du bot :</strong> Les configurations du bot par serveur (ex: le salon où le panel de musique est ancré) sont stockées de façon sécurisée et chiffrée sur notre serveur d'hébergement de base de données.</li>
            </ul>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Share2 size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>3. Partage des Données</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Nous tenons fermement à votre vie privée. Aucune des informations techniques que nous collectons n'est partagée, vendue, transférée ou louée à des tiers, à des régies publicitaires ou à des fins commerciales. Le service est 100% à but non lucratif.
            </p>
          </section>

          <section style={{ background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <HelpCircle size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>4. Vos Droits & Suppression</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
              Conformément à la réglementation sur la protection des données personnelles, vous disposez d'un droit complet d'accès et de suppression de vos données. Pour supprimer toutes vos préférences ou données de configuration stockées, il vous suffit de retirer le bot <strong>Foxy Music</strong> de votre serveur Discord ou de cliquer sur "Se déconnecter" depuis le dashboard.
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

export default PrivacyPolicy;
