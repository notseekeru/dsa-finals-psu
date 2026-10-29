import { Link } from "react-router-dom";

export default function NotFound() {
    return (
        <main>
            <h1>Not found</h1>
            <p>That route does not exist.</p>
            <p>
                <Link to="/">Back home</Link>
            </p>
        </main>
    );
}
