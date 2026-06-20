import bannerImg from '../../assets/banner.png'
import './HeroBanner.css'

interface FeaturedNews {
  title: string
  subtitle?: string
  image?: string
  link?: string
  cta?: string
}

interface Props {
  featured?: FeaturedNews
  fallbackTitle?: string
  fallbackSubtitle?: string
}

export default function HeroBanner({ featured, fallbackTitle, fallbackSubtitle }: Props) {
  const image = featured?.image || bannerImg
  const cta = featured?.cta
  const link = featured?.link

  function handleClick() {
    if (link) window.glitnir.shell.openExternal(link)
  }

  return (
    <>
      <div
        className="hero-banner"
        style={{ backgroundImage: `url(${image})` }}
      >
        <div className="hero-overlay" />
        {featured && (
          <div className="hero-content">
            <h1 className="hero-title">{featured.title}</h1>
            {featured.subtitle && <p className="hero-subtitle">{featured.subtitle}</p>}
            {cta && link && (
              <button className="hero-cta" onClick={handleClick}>{cta}</button>
            )}
          </div>
        )}
      </div>

      {!featured && (
        <div className="hero-caption">
          <h1 className="hero-title">{fallbackTitle || 'Bem-vindo ao Glitnir'}</h1>
          <p className="hero-subtitle">{fallbackSubtitle || 'Servidor de Valheim com mods exclusivos'}</p>
        </div>
      )}
    </>
  )
}
