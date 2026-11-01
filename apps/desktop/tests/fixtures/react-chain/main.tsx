import { createRoot } from 'react-dom/client';
import { ComposePage } from './Compose';

const root = document.getElementById('root');
if (root) createRoot(root).render(<ComposePage />);
