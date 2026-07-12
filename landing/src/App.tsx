import { ControlSection, Footer, PricingSection, Workflow } from './components/product-story';
import { CtaSection } from './components/CtaSection';

const App = () => (
  <main>
    <CtaSection />
    <PricingSection />
    <Workflow />
    <ControlSection />
    <Footer />
  </main>
);

export default App;