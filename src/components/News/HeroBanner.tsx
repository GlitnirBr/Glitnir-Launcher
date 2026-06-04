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
  const title = featured?.title || fallbackTitle || 'Bem-vindo ao Glitnir'
  const subtitle = featured?.subtitle || fallbackSubtitle || 'Servidor de Valheim com mods exclusivos'
  const image = featured?.image
  const cta = featured?.cta
  const link = featured?.link

  function handleClick() {
    if (link) {
      window.glitnir.shell.openExternal(link)
    }
  }

  return (
    <div
      className="hero-banner"
      style={image ? { backgroundImage: `url(${image})` } : undefined}
    >
      <div className="hero-overlay" />
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-subtitle">{subtitle}</p>
        {cta && link && (
          <button className="hero-cta" onClick={handleClick}>
            {cta}
          </button>
        )}
      </div>
    </div>
  )
}
