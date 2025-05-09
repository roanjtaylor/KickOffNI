import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";

// Imports for Firestore reading
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig"; // Reference to the Firestore database

// Stripe payment
import {
  StripeProvider,
  CardField,
  useConfirmPayment,
} from "@stripe/stripe-react-native";

// Use Environment variables to keep sensistive data hidden.
import Constants from "expo-constants";

//ADD localhost address of your server
const API_URL = Constants.expoConfig?.extra?.serverURL || ""; // For local testing: http://<IP address>:<port>

export default function PayHandler({ navigation, route }) {
  const { match, email } = route.params;

  const [cardDetails, setCardDetails] = useState();
  const { confirmPayment, loading } = useConfirmPayment();

  const [isProcessing, setIsProcessing] = useState(false); // New state to track loading

  const handlePay = async () => {
    // Prevent multiple clicks by checking if already processing
    if (isProcessing) return;

    // 1. Gather the customer's billing information (e.g., email)
    if (!cardDetails?.complete) {
      Alert.alert("Please enter correct card details.");
      return;
    }

    // 2. Check user bookings
    if (match.users.length == match.capacity) {
      // Match is Full, so user cannot sign up for it
      Alert.alert(
        "Match Full!",
        "Sadly that match is full, you cannot sign up for it",
        { text: "OK" }
      );
      return;
    }

    // Space is available, so can sign up the user!
    // 3. Check if user is in the booked users
    if (match.users.includes(email)) {
      // User already signed up, Alert the user.
      // TESTING NOTE: includes() is case sensitive- may need to adjust email login so that all lowercase as uppercase start changes the value
      Alert.alert("Signup Error", "You're already signed up for this game.", [
        {
          text: "OK",
        },
      ]);
      return;
    }

    // 4. Fetch the intent client secret from the backend
    // Start processing payment
    setIsProcessing(true);

    try {
      const { clientSecret, error } = await fetchPaymentIntentClientSecret();

      // 5. Confirm the payment with the card details
      if (error) {
        Alert.alert("Error", "Unable to process payment.");
        setIsProcessing(false); // Reset processing state on error
      } else {
        const { paymentIntent, error } = await confirmPayment(clientSecret, {
          paymentMethodType: "Card",
          billingDetails: email,
          receipt_email: email,
        });
        if (error) {
          Alert.alert(`Payment Confirmation Error ${error.message}`);
          setIsProcessing(false); // Reset processing state on error
        } else if (paymentIntent) {
          // 6. Write user to match and match to user (Storing change in database)
          // Write user to DB (Alert if already in, or if successful)
          // User not signed up yet, write user to the database.
          // Write the username into the bookedUsers array in this match
          match.users.push(email);

          // Update current match in Firestore.
          try {
            const docRef = await updateDoc(doc(db, "matches", match.id), {
              BookedUsers: match.users,
            });
          } catch (error) {
            console.error("Error adding document: ", error);
            setIsProcessing(false);
          }

          // Write the match ID into the user's bookedMatches
          // Try to get the user and store in variable
          const userQuery = await getDoc(doc(db, "users", email));

          if (userQuery.exists()) {
            // If found, append matches array
            const updatedMatches = userQuery.data().Matches;
            updatedMatches.push(match.id);

            // Write updated user to database
            try {
              const docRef = await updateDoc(doc(db, "users", email), {
                Matches: updatedMatches,
              });

              Alert.alert("Payment success! See you at the match!");
              navigation.goBack(); // Successful, thus return to discover screen.
            } catch (error) {
              console.error("Error updating user document: ", error);
              setIsProcessing(false);
            }
          } else {
            // If not, write a new document with email, matches array (+ this match)
            try {
              // Logic to write to the Firestore database
              const docRef = await setDoc(doc(db, "users", email), {
                Matches: [match.id],
              });

              Alert.alert("Payment success! See you at the match!");
              navigation.goBack(); // Successful, thus return to discover screen.
            } catch (error) {
              console.error("Error creating user document: ", error);
              setIsProcessing(false);
            }
            console.log("User not found, so written.");
          }
        }
      }
    } catch (e) {
      console.log(e);
      setIsProcessing(false); // Reset processing state on exception
    } finally {
      setIsProcessing(false); // Reset processing state
    }
  };

  const fetchPaymentIntentClientSecret = async () => {
    const response = await fetch(`${API_URL}/create-payment-intent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const { clientSecret, error } = await response.json();
    return { clientSecret, error };
  };

  return (
    <StripeProvider
      publishableKey={Constants.expoConfig?.extra?.publishableKey || ""}
    >
      <ScrollView style={styles.container}>
        <StatusBar style="auto" />
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Match Details:</Text>
        </View>

        <View style={styles.scrollView}>
          <Text style={styles.matchesTitle}>{match.name}</Text>

          <Text style={styles.subtitle}>Date: {match.date}</Text>
          <Text style={styles.subtitle}>
            Currently: {match.users.length} / {match.capacity} Players
          </Text>
          <Text style={styles.subtitle}>Cost per Player: £5.00.</Text>
          <Text style={styles.subtitle}>Description: {match.description}</Text>

          <Text style={styles.subtitleCyan}>
            For now, we cannot facilitate refunds or cancellations. Only pay for
            a ticket if you know you can attend.
          </Text>

          <Image
            source={{ uri: match.imageURL }}
            style={{ alignSelf: "center", width: 300, height: 300 }}
          />

          <CardField
            postalCodeEnabled={false}
            placeholder={{
              number: "4242 4242 4242 4242",
            }}
            cardStyle={styles.card}
            style={styles.cardContainer}
            onCardChange={(cardDetails) => {
              setCardDetails(cardDetails);
            }}
          />
          <TouchableOpacity
            style={{
              alignItems: "center",
              backgroundColor: isProcessing ? "gray" : "cyan",
              padding: 10,
              margin: 10,
              marginBottom: 300,
              borderRadius: 100,
            }}
            onPress={handlePay} // Call function, passing in necessary parameters, to carry out the money management????
            disabled={isProcessing}
          >
            <Text>
              {isProcessing
                ? "Processing..."
                : "Click to confirm payment of £5."}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    paddingLeft: "7%", // Space that is not the screen- blank space for ease of layouts
    paddingTop: "7%",
    paddingRight: "7%",
    backgroundColor: "rgb(35, 31, 32)", // Charcoal grey
  },

  header: {
    width: "100%",
    height: "7%", // Looks about ~1/4 of screen. Needs checked and clarified.
    paddingTop: "7%",
    backgroundColor: "rgb(35, 31, 32)", // charcoal grey
    borderBottomColor: "#a4a3a3", // Light gray, as from Figma
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#a4a3a3", // Light gray, as from Figma
    paddingLeft: "7%", // Matching component padding in container
  },

  matchesTitle: {
    fontSize: 22,
    fontWeight: "500",
    color: "rgb(0,225,130)", // turqoise green
  },

  subtitle: {
    fontSize: 18,
    fontWeight: "400",
    color: "white",
    paddingTop: "1%",
  },

  subtitleCyan: {
    fontSize: 18,
    fontWeight: "400",
    color: "cyan",
    paddingTop: "4%",
    paddingBottom: "4%",
    textAlign: "center",
  },

  scrollView: {
    width: "100%",
    paddingTop: "7%",
    backgroundColor: "rgb(35, 31, 32)", // Charcoal grey
    fontSize: 22, // Font size of text within input field
  },

  card: {
    backgroundColor: "#efefefef",
  },
  cardContainer: {
    height: 50,
    marginVertical: 30,
  },
});
