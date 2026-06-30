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
  const title = featured?.title || fallbackTitle || 'Glitnir'
  const subtitle = featured?.subtitle || fallbackSubtitle
  const cta = featured?.cta
  const link = featured?.link

  function handleClick() {
    if (link) window.glitnir.shell.openExternal(link)
  }

  return (
    <div
      className={`hero-banner${link ? ' hero-banner--clickable' : ''}`}
      style={{ backgroundImage: `url(${image})` }}
      onClick={link ? handleClick : undefined}
    >
      <div className="hero-overlay" />
      <div className="hero-content">
        <h1 className="hero-title">{title}</h1>
        {subtitle && <p className="hero-subtitle">{subtitle}</p>}
        {cta && link && (
          <button
            className="hero-cta"
            onClick={e => { e.stopPropagation(); handleClick() }}
          >
            {cta}
          </button>
        )}
      </div>
    </div>
  )
}
