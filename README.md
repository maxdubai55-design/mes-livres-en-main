# mes-livres-en-main
Ventes livres
index.html, catalogue.html, produit.html, panier.html, checkout.html, contact.html, apropos.html, styles.css, script.js).
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Découvrez et achetez mes livres inspirants sur Mes Livres en Main. Livraison rapide et paiements sécurisés.">
    <title>Mes Livres en Main - Accueil</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Mes Livres en Main</h1>
        <nav>
            <ul>
                <li><a href="index.html">Accueil</a></li>
                <li><a href="catalogue.html">Catalogue</a></li>
                <li><a href="panier.html">Panier</a></li>
                <li><a href="contact.html">Contact</a></li>
                <li><a href="apropos.html">À propos</a></li>
            </ul>
            <input type="text" id="search" placeholder="Rechercher un livre..." oninput="searchBooks()">
        </nav>
    </header>
    
    <main>
        <section id="hero">
            <h2>Bienvenue sur Mes Livres en Main !</h2>
            <p>Découvrez mes ouvrages inspirants, écrits avec passion. Achetez-les en ligne et recevez-les chez vous.</p>
            <a href="catalogue.html" class="btn">Voir le catalogue</a>
        </section>
        
        <section id="featured">
            <h2>Livres en vedette</h2>
            <div class="books">
                <div class="book">
                    <img src="https://via.placeholder.com/200x300?text=Livre+1" alt="Livre 1">
                    <h3>Livre 1 : Aventure Épique</h3>
                    <p>Prix : 15€</p>
                    <a href="produit.html?id=1" class="btn">Détails</a>
                </div>
                <!-- Ajoutez d'autres livres similaires -->
            </div>
        </section>
        
        <section id="testimonials">
            <h2>Avis des lecteurs</h2>
            <p>"Un livre captivant !" - Lecteur satisfait</p>
        </section>
    </main>
    
    <footer>
        <p>&copy; 2025 Mes Livres en Main. Tous droits réservés.</p>
        <ul>
            <li><a href="#">Facebook</a></li>
            <li><a href="#">Instagram</a></li>
        </ul>
    </footer>
    
    <script src="script.js"></script>
</body>
</html>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mes Livres en Main - Catalogue</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Header et nav identiques à index.html -->
    <header>...</header> <!-- Copiez de index.html -->
    
    <main>
        <h2>Notre Catalogue</h2>
        <div id="book-list" class="books">
            <div class="book" data-title="Livre 1 : Aventure Épique">
                <img src="https://via.placeholder.com/200x300?text=Livre+1" alt="Livre 1">
                <h3>Livre 1 : Aventure Épique</h3>
                <p>Description : Une histoire passionnante.</p>
                <p>Prix : 15€</p>
                <button onclick="addToCart(1, 'Livre 1', 15)">Ajouter au panier</button>
            </div>
            <div class="book" data-title="Livre 2 : Mystère Profond">
                <img src="https://via.placeholder.com/200x300?text=Livre+2" alt="Livre 2">
                <h3>Livre 2 : Mystère Profond</h3>
                <p>Description : Un thriller haletant.</p>
                <p>Prix : 20€</p>
                <button onclick="addToCart(2, 'Livre 2', 20)">Ajouter au panier</button>
            </div>
            <div class="book" data-title="Livre 3 : Inspiration Quotidienne">
                <img src="https://via.placeholder.com/200x300?text=Livre+3" alt="Livre 3">
                <h3>Livre 3 : Inspiration Quotidienne</h3>
                <p>Description : Des conseils pour la vie.</p>
                <p>Prix : 10€</p>
                <button onclick="addToCart(3, 'Livre 3', 10)">Ajouter au panier</button>
            </div>
        </div>
    </main>
    
    <footer>...</footer> <!-- Copiez de index.html -->
    <script src="script.js"></script>
</body>
</html>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mes Livres en Main - Détails du Livre</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Header -->
    <header>...</header>
    
    <main id="product-detail">
        <!-- Contenu chargé via JS -->
    </main>
    
    <footer>...</footer>
    <script src="script.js"></script>
    <script>
        const books = [
            {id:1, title:'Livre 1 : Aventure Épique', desc:'Description détaillée...', price:15, img:'https://via.placeholder.com/200x300?text=Livre+1'},
            {id:2, title:'Livre 2 : Mystère Profond', desc:'Description détaillée...', price:20, img:'https://via.placeholder.com/200x300?text=Livre+2'},
            {id:3, title:'Livre 3 : Inspiration Quotidienne', desc:'Description détaillée...', price:10, img:'https://via.placeholder.com/200x300?text=Livre+3'}
        ];
        const urlParams = new URLSearchParams(window.location.search);
        const id = parseInt(urlParams.get('id'));
        const book = books.find(b => b.id === id);
        if (book) {
            document.getElementById('product-detail').innerHTML = `
                <img src="${book.img}" alt="${book.title}">
                <h2>${book.title}</h2>
                <p>${book.desc}</p>
                <p>Prix : ${book.price}€</p>
                <button 
 <!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mes Livres en Main - Panier</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Header -->
    <header>...</header>
    
    <main>
        <h2>Votre Panier</h2>
        <div id="cart-items"></div>
        <p>Total : <span id="total">0</span>€</p>
        
        <a href="checkout.html" class="btn">Passer à la commande</a>
    </main>
    
    <footer>...</footer>
    <script src="script.js"></script>
    <script>displayCart();</script>
</body>
</html>    
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mes Livres en Main - Commande</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Header -->
    <header>...</header>
    
    <main>
        <h2>Finaliser votre commande</h2>
        <form>
            <label>Nom : <input type="text" required></label>
            <label>Adresse : <input type="text" required></label>
            <label>Email : <input type="email" required></label>
            <!-- Intégrez Stripe ici en production -->
            <button type="submit">Payer</button>
        </form>
    </main>
    
    <footer>...</footer>
    <script src="script.js"></script>
</body>
</html>onclick="addToCart(${book.id}, '${book.title}', ${book.price})">Ajouter au panier</button>
            `;
        }
    </script>
</body>
</html>
body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f0f8ff; color: #333; }
header { background: #4caf50; color: white; padding: 1em; text-align: center; }
nav ul { list-style: none; padding: 0; display: flex; justify-content: center; }
nav li { margin: 0 1em; }
nav a { color: white; text-decoration: none; }
#search { margin: 1em; padding: 0.5em; width: 200px; }
.books { display: flex; flex-wrap: wrap; justify-content: center; }
.book { margin: 1em; padding: 1em; border: 1px solid #ddd; width: 200px; text-align: center; background: white; }
.btn { background: #ff9800; color: white; padding: 0.5em 1em; text-decoration: none; border-radius: 5px; }
footer { background: #333; color: white; text-align: center; padding: 1em; }
@media (max-width: 600px) { .books { flex-direction: column; } }
let cart = JSON.parse(localStorage.getItem('cart')) || [];

function addToCart(id, title, price) {
    const item = {id, title, price};
    cart.push(item);
    localStorage.setItem('cart', JSON.stringify(cart));
    alert('Ajouté au panier !');
}

function displayCart() {
    const cartItems = document.getElementById('cart-items');
    const totalElem = document.getElementById('total');
    if (cartItems) {
        cartItems.innerHTML = cart.map((item, index) => `
            <div>
                <p>${item.title} - ${item.price}€</p>
                <button onclick="removeFromCart(${index})">Supprimer</button>
            </div>
        `).join('');
        const total = cart.reduce((sum, item) => sum + item.price, 0);
        totalElem.textContent = total;
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    displayCart();
}

function searchBooks() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const books = document.querySelectorAll('.book');
    books.forEach(book => {
        const title = book.dataset.title.toLowerCase();
        book.style.display = title.includes(searchTerm) ? 'block' : 'none';
    });
}
