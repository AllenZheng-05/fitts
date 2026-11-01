export default function Login() {
  return (
    <form aria-label="Log in" onSubmit={login}>
      <input name="email" type="email" required />
      <input name="password" type="password" required minLength={8} />
      <button type="submit">Log in</button>
    </form>
  );
}
function login() {}
