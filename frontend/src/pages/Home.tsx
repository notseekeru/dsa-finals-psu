import { Link } from "react-router-dom";

export default function Home() {
    return (
        <main>
            <h1>DSA Finals PSU</h1>
            <p>Platform scaffold. The app lands here.</p>
            <p>
                <Link to="/missing">404 route</Link>
            </p>
        </main>
    );
}
