import './style.css'

const app = document.querySelector<HTMLElement>('#app')

if (!app) {
  throw new Error('Locus application root is missing')
}

app.innerHTML = `
  <section class="shell" aria-labelledby="locus-title">
    <p class="eyebrow">GeoHistory applet</p>
    <h1 id="locus-title">Locus</h1>
    <p class="lede">What happened near here?</p>
    <p>The map and nearby-event experience will arrive in a reviewed feature slice.</p>
  </section>
`
