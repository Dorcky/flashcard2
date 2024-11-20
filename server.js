require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error(err));

// Flashcard Schema
const flashcardSchema = new mongoose.Schema({
  front: String,
  back: String,
  collectionName: String,  // Renommé pour éviter le mot réservé
  known: { type: Boolean, default: false },
  reviewed: { type: Boolean, default: false }
});
const Flashcard = mongoose.model('Flashcard', flashcardSchema);

// Collection Schema
const collectionSchema = new mongoose.Schema({
  name: String,
  flashcards: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Flashcard' }]
});
const Collection = mongoose.model('Collection', collectionSchema);

// File Upload Setup
const upload = multer({ dest: 'uploads/' });

// Routes

// 1. Upload Flashcards via CSV
app.post('/api/flashcards/upload', upload.single('file'), async (req, res) => {
    console.log('Fichier reçu:', req.file);
    const { collectionName } = req.body;

    // Vérifier si le fichier et le nom de la collection sont fournis
    if (!req.file) {
        return res.status(400).json({ message: 'Aucun fichier n\'a été envoyé.' });
    }

    if (!collectionName) {
        return res.status(400).json({ message: 'Nom de la collection requis.' });
    }

    const flashcards = [];
    const collection = new Collection({ name: collectionName });

    fs.createReadStream(req.file.path)
    .pipe(csvParser())
    .on('data', (data) => {
        // Nettoyer les valeurs et enlever les espaces supplémentaires
        const front = data.Front ? data.Front.trim() : '';
        const back = data.Back ? data.Back.trim() : '';

        // Log pour vérifier les valeurs exactes des colonnes Front et Back
        console.log(`Front: "${front}", Back: "${back}"`);

        // Si l'une des colonnes est vide ou invalide, on ignore la ligne
        if (!front || !back) {
            console.log("Ligne ignorée, colonnes manquantes ou invalides : ", data);
            return;
        }

        // Ajouter la flashcard à la liste
        flashcards.push({
            front,
            back,
            collectionName
        });
    })
    .on('end', async () => {
        if (flashcards.length > 0) {
            try {
                // Insérer les flashcards dans MongoDB
                const savedFlashcards = await Flashcard.insertMany(flashcards);
                // Ajouter les flashcards à la collection
                collection.flashcards = savedFlashcards.map(flashcard => flashcard._id);
                await collection.save();
                console.log(`${flashcards.length} flashcards ajoutées à la collection "${collectionName}"`);
                res.status(200).json({ message: 'Flashcards uploaded and collection created' });
            } catch (err) {
                console.error('Erreur d\'insertion dans la base de données:', err);
                res.status(500).json({ message: 'Erreur lors de l\'insertion des flashcards dans la base de données' });
            }
        } else {
            console.log("Aucune flashcard valide trouvée.");
            res.status(400).json({ message: 'Aucune flashcard valide trouvée dans le fichier CSV' });
        }

        // Supprimer le fichier après traitement
        fs.unlinkSync(req.file.path);
    });
});

// 2. Get Flashcards by Collection
app.get('/api/collections/:collectionName', async (req, res) => {
  try {
    const collection = await Collection.findOne({ name: req.params.collectionName }).populate('flashcards');
    if (collection) {
      res.json(collection.flashcards);
    } else {
      res.status(404).json({ message: 'Collection not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving collection' });
  }
});

// 3. Get All Collections
app.get('/api/collections', async (req, res) => {
  try {
    const collections = await Collection.find();
    res.json(collections);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error retrieving collections' });
  }
});

// Update Flashcard
app.put('/api/flashcards/:id', async (req, res) => {
  try {
    const updatedCard = await Flashcard.findByIdAndUpdate(
      req.params.id,
      { 
        known: req.body.known, 
        reviewed: req.body.reviewed 
      },
      { new: true }
    );
    res.json(updatedCard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating flashcard' });
  }
});

// Server Listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
