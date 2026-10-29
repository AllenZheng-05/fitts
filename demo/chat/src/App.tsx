import { Compose, ComposeConfirm, ComposeRecipient } from './pages/Compose';
import { Contacts } from './pages/Contacts';
import { Inbox } from './pages/Inbox';
import { NotFound } from './pages/NotFound';
import { Search } from './pages/Search';
import { Settings } from './pages/Settings';
import { Thread } from './pages/Thread';
import { usePath } from './router';

function page(path: string) {
  switch (path) {
    case '/':
      return <Inbox />;
    case '/compose':
      return <Compose />;
    case '/compose/recipient':
      return <ComposeRecipient />;
    case '/compose/confirm':
      return <ComposeConfirm />;
    case '/search':
      return <Search />;
    case '/contacts':
      return <Contacts />;
    case '/contacts/grandma':
      return <Thread conversationId={12} />;
    case '/settings':
      return <Settings />;
    default:
      return <NotFound />;
  }
}

export function App() {
  const path = usePath();
  return (
    <div className="site">
      <main className="card">{page(path)}</main>
    </div>
  );
}
