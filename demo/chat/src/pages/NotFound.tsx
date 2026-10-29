import { navigate } from '../router';

export function NotFound() {
  return (
    <>
      <h1 className="title">Page not found</h1>
      <button type="button" className="link" onClick={() => navigate('/')}>
        Back to messages
      </button>
    </>
  );
}
