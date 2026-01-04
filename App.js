import { StatusBar } from "expo-status-bar";
import { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  BackHandler,
  Animated,
  Easing,
  ScrollView,
  FlatList,
} from "react-native";
import { Audio } from "expo-av";
import ConfettiCannon from "react-native-confetti-cannon";
import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

// --- 🎨 CONSTANTS ---
const COLORS = {
  bg: "#222",
  card: "#333",
  primary: "#f1c40f",
  secondary: "#27ae60",
  danger: "#e74c3c",
  text: "#fff",
  textDim: "#ccc",
  blue: "#3498db",
};

const LINKS = {
  instagram:
    "https://www.instagram.com/mdsarfaraz5231?igsh=MTVhd3RrYTNjZm9kYg==",
  facebook: "https://www.facebook.com/profile.php?id=100025941873168",
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState("MENU");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [gameSettings, setGameSettings] = useState({
    rounds: 3,
    currentRound: 1,
  });
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [waiting, setWaiting] = useState(false);
  const [seriesWinner, setSeriesWinner] = useState(null);
  const [savedNames, setSavedNames] = useState([]);
  const [historyList, setHistoryList] = useState([]);

  // Animation States
  const [showRoundResult, setShowRoundResult] = useState(false);
  const [roundWinnerName, setRoundWinnerName] = useState("");

  // Animation & Sound Refs
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef(null);

  // 🛡️ Fix #6: Async Storage Safety (Memory Leak Protection)
  useEffect(() => {
    let isMounted = true; // Track if component is alive
    const loadData = async () => {
      try {
        const [names, history] = await Promise.all([
          AsyncStorage.getItem("playerNames"),
          AsyncStorage.getItem("matchHistory"),
        ]);
        if (isMounted) {
          if (names) setSavedNames(JSON.parse(names));
          if (history) setHistoryList(JSON.parse(history));
        }
      } catch (e) {}
    };
    loadData();
    return () => {
      isMounted = false;
    }; // Cleanup function
  }, []);

  // --- 🎵 PRO LEVEL SOUND SYSTEM (Fix #1 & #2) ---
  const playSound = async (type) => {
    try {
      // 1. Agar purana sound hai, to safely stop aur unload karo
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch (e) {}
        soundRef.current = null; // Fix: Reference clear karo
      }

      const source =
        type === "win"
          ? require("./assets/win.mp3")
          : require("./assets/click.mp3");
      const { sound } = await Audio.Sound.createAsync(source);

      soundRef.current = sound;
      await sound.playAsync();

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.didJustFinish) {
          try {
            await sound.unloadAsync();
          } catch (e) {}
          // Agar wahi sound abhi bhi ref mein hai to null karo
          if (soundRef.current === sound) {
            soundRef.current = null;
          }
        }
      });
    } catch (error) {
      /* Ignore benign errors */
    }
  };

  // --- 🔇 ROBUST CLEANUP ON MENU EXIT ---
  const goToMenu = async () => {
    // 1. Sound Cleanup
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
    }

    // 2. Animation Cleanup (Fix #3: Race Condition)
    scaleAnim.stopAnimation(); // Chal rahi animation ko roko
    scaleAnim.setValue(1); // Reset scale to normal
    setShowRoundResult(false);
    setWaiting(false);

    // 3. Navigate
    setCurrentScreen("MENU");
  };

  const saveName = async (n1, n2) => {
    if (!n1 || !n2) return;
    const newList = [...new Set([n1, n2, ...savedNames])]
      .filter((n) => n.trim() !== "")
      .slice(0, 6);
    setSavedNames(newList);
    AsyncStorage.setItem("playerNames", JSON.stringify(newList));
  };

  const saveHistory = async (winner, s1, s2) => {
    const now = new Date();
    const newMatch = {
      id: Date.now().toString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      p1: p1Name,
      p2: p2Name,
      winner: winner === "Draw" ? "Draw" : `${winner} Won`,
      score: `${s1} - ${s2}`,
      rounds: gameSettings.rounds,
    };
    const updated = [newMatch, ...historyList];
    setHistoryList(updated);
    AsyncStorage.setItem("matchHistory", JSON.stringify(updated));
  };

  const deleteHistory = async (id = null) => {
    if (id) {
      const updated = historyList.filter((item) => item.id !== id);
      setHistoryList(updated);
      AsyncStorage.setItem("matchHistory", JSON.stringify(updated));
    } else {
      Alert.alert("Clear History", "Delete All?", [
        { text: "Cancel" },
        {
          text: "Delete",
          onPress: () => {
            setHistoryList([]);
            AsyncStorage.removeItem("matchHistory");
          },
        },
      ]);
    }
  };

  const startGame = () => {
    if (!p1Name.trim() || !p2Name.trim()) {
      Alert.alert("Error", "Enter names");
      return;
    }
    saveName(p1Name, p2Name);
    setCurrentScreen("GAME");
    setGameSettings({ ...gameSettings, currentRound: 1 });
    setScores({ p1: 0, p2: 0 });
    setSeriesWinner(null);
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setWaiting(false);
  };

  const handlePress = (index) => {
    if (board[index] || waiting || showRoundResult) return;
    playSound("click");
    const newBoard = [...board];
    newBoard[index] = isXNext ? "X" : "O";
    setBoard(newBoard);
    const winner = calculateWinner(newBoard);
    const isDraw = !newBoard.includes(null);
    if (winner) handleRoundEnd(winner);
    else if (isDraw) handleRoundEnd("Draw");
    else setIsXNext(!isXNext);
  };

  const calculateWinner = (squares) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c])
        return squares[a];
    }
    return null;
  };

  const handleRoundEnd = (winnerSymbol) => {
    setWaiting(true);
    let roundWinner = "Draw";
    let newScores = { ...scores };
    if (winnerSymbol === "X") {
      newScores.p1++;
      roundWinner = `${p1Name} Wins!`;
    } else if (winnerSymbol === "O") {
      newScores.p2++;
      roundWinner = `${p2Name} Wins!`;
    }
    setScores(newScores);

    const winningThreshold = Math.floor(gameSettings.rounds / 2) + 1;
    const hasEarlyWinner =
      newScores.p1 >= winningThreshold || newScores.p2 >= winningThreshold;

    runZoomAnimation(roundWinner, () => {
      if (hasEarlyWinner || gameSettings.currentRound >= gameSettings.rounds) {
        endTournament(newScores);
      } else {
        setBoard(Array(9).fill(null));
        const nextRound = gameSettings.currentRound + 1;
        setIsXNext(nextRound % 2 !== 0);
        setGameSettings((prev) => ({ ...prev, currentRound: nextRound }));
        setWaiting(false);
      }
    });
  };

  const endTournament = (finalScores) => {
    playSound("win");
    let winner = "Draw";
    if (finalScores.p1 > finalScores.p2) winner = p1Name;
    else if (finalScores.p2 > finalScores.p1) winner = p2Name;
    setSeriesWinner(winner);
    saveHistory(winner, finalScores.p1, finalScores.p2);
    setCurrentScreen("WINNER");
  };

  // --- 🎬 SAFE ANIMATION LOGIC (Fix #3) ---
  const runZoomAnimation = (text, callback) => {
    // Stop any ongoing animation first
    scaleAnim.stopAnimation();

    Animated.timing(scaleAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setRoundWinnerName(text);
      setShowRoundResult(true);
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
        easing: Easing.elastic(1.5),
      }).start(() => {
        setTimeout(() => {
          Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }).start(() => {
            setShowRoundResult(false);
            callback();
            // Small Delay for Render Safety
            setTimeout(() => {
              Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
                easing: Easing.out(Easing.back(1)),
              }).start();
            }, 100);
          });
        }, 2000);
      });
    });
  };

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <Text style={styles.footerText}>Developed by Sarfaraz ❤️</Text>
      <View style={styles.socialIcons}>
        <TouchableOpacity
          onPress={() => Linking.openURL(LINKS.instagram)}
          style={styles.iconBtn}
        >
          <FontAwesome5 name="instagram" size={24} color="#E1306C" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openURL(LINKS.facebook)}
          style={styles.iconBtn}
        >
          <FontAwesome5 name="facebook-square" size={24} color="#1877F2" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMenu = () => (
    <View style={styles.content}>
      <Text style={styles.title}>Tic Tac Toe 🏆</Text>
      <View style={styles.inputBox}>
        <Text style={styles.label}>Player 1 (X)</Text>
        <TextInput
          style={styles.input}
          value={p1Name}
          onChangeText={setP1Name}
          placeholder="Enter Name"
          placeholderTextColor="#999"
        />
        <Text style={styles.label}>Player 2 (O)</Text>
        <TextInput
          style={styles.input}
          value={p2Name}
          onChangeText={setP2Name}
          placeholder="Enter Name"
          placeholderTextColor="#999"
        />
        {savedNames.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.subLabel}>Recent Players:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 5 }}
            >
              {savedNames.map((name, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.chip}
                  onPress={() => (!p1Name ? setP1Name(name) : setP2Name(name))}
                >
                  <Text style={styles.chipText}>{name}</Text>
                  <FontAwesome5
                    name="plus"
                    size={10}
                    color="#fff"
                    style={{ marginLeft: 5 }}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      <View style={styles.roundsSection}>
        <View style={styles.roundsHeader}>
          <FontAwesome5 name="gamepad" size={18} color={COLORS.primary} />
          <Text style={styles.roundsLabel}>BEST OF ROUNDS</Text>
        </View>
        <View style={styles.roundsContainer}>
          {[3, 7, 11].map((r) => (
            <TouchableOpacity
              key={r}
              activeOpacity={0.7}
              style={[
                styles.roundBtn,
                gameSettings.rounds === r && styles.selectedRound,
              ]}
              onPress={() => setGameSettings({ ...gameSettings, rounds: r })}
            >
              <Text
                style={[
                  styles.roundText,
                  gameSettings.rounds === r && styles.selectedRoundText,
                ]}
              >
                {r}
              </Text>
              {gameSettings.rounds === r && <View style={styles.activeDot} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={startGame}>
        <Text style={styles.btnText}>Start Tournament 🚀</Text>
      </TouchableOpacity>
    </View>
  );

  const renderGame = () => (
    <View style={styles.content}>
      <View style={styles.scoreBoard}>
        <View style={[styles.pBox, isXNext && styles.activePBox]}>
          <Text style={styles.pName} numberOfLines={1}>
            {p1Name}
          </Text>
          <Text style={{ color: COLORS.danger, fontSize: 12 }}>(X)</Text>
          <Text style={styles.score}>{scores.p1}</Text>
        </View>
        <Text style={{ color: "#666", fontWeight: "bold", marginTop: 20 }}>
          VS
        </Text>
        <View style={[styles.pBox, !isXNext && styles.activePBox]}>
          <Text style={styles.pName} numberOfLines={1}>
            {p2Name}
          </Text>
          <Text style={{ color: COLORS.blue, fontSize: 12 }}>(O)</Text>
          <Text style={styles.score}>{scores.p2}</Text>
        </View>
      </View>

      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {showRoundResult ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Round Winner</Text>
            <FontAwesome5
              name="trophy"
              size={50}
              color={COLORS.primary}
              style={{ marginBottom: 20 }}
            />
            <Text style={styles.resultName}>{roundWinnerName}</Text>
          </View>
        ) : (
          // Fix #4: key prop rakha hai (Reliability ke liye)
          <View style={styles.board} key={gameSettings.currentRound}>
            {board.map((cell, i) => (
              <TouchableOpacity
                key={i}
                style={styles.square}
                onPress={() => handlePress(i)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.cellText,
                    cell === "X"
                      ? { color: COLORS.danger }
                      : { color: COLORS.blue },
                  ]}
                >
                  {cell}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Animated.View>
      <Text style={styles.turnText}>
        {waiting ? "Please Wait..." : `Turn: ${isXNext ? p1Name : p2Name}`}
      </Text>
    </View>
  );

  const renderWinner = () => (
    <View style={styles.content}>
      {seriesWinner && <ConfettiCannon count={200} origin={{ x: -10, y: 0 }} />}
      <Text style={styles.winnerText}>🏆 CHAMPION 🏆</Text>
      <Text style={styles.winnerName}>
        {seriesWinner === "Draw" ? "It's a Draw!" : seriesWinner}
      </Text>
      <Text style={styles.finalScore}>
        Final Score: {scores.p1} - {scores.p2}
      </Text>
      <TouchableOpacity style={styles.resetBtn} onPress={goToMenu}>
        <Text style={styles.btnText}>Main Menu 🏠</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistory = () => (
    <View
      style={[styles.content, { justifyContent: "flex-start", paddingTop: 10 }]}
    >
      {historyList.length === 0 ? (
        <View style={{ marginTop: 100, alignItems: "center" }}>
          <FontAwesome5 name="ghost" size={50} color="#444" />
          <Text style={{ color: "#666", marginTop: 10 }}>
            No match history found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={historyList}
          keyExtractor={(item) => item.id}
          style={{ width: "95%" }}
          contentContainerStyle={{ paddingBottom: 20 }}
          renderItem={({ item }) => (
            <View style={styles.historyCard}>
              <View style={styles.historyRow}>
                <Text style={styles.historyDate}>
                  {item.date} • {item.time}
                </Text>
                <TouchableOpacity
                  onPress={() => deleteHistory(item.id)}
                  style={{ padding: 5 }}
                >
                  <FontAwesome5 name="trash" size={14} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
              <Text style={styles.historyPlayers}>
                {item.p1}{" "}
                <Text style={{ color: "#888", fontSize: 14 }}>vs</Text>{" "}
                {item.p2}
              </Text>
              <View style={styles.historyRow}>
                <Text style={{ color: COLORS.secondary, fontWeight: "bold" }}>
                  🏆 {item.winner}
                </Text>
                <Text style={{ color: COLORS.primary, fontWeight: "bold" }}>
                  Score: {item.score}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        {currentScreen === "MENU" ? (
          <>
            <TouchableOpacity
              onPress={() => setCurrentScreen("HISTORY")}
              style={styles.navBtn}
            >
              <FontAwesome5 name="history" size={16} color={COLORS.primary} />
              <Text style={styles.navText}> History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => BackHandler.exitApp()}
              style={styles.navBtn}
            >
              <Text style={[styles.navText, { color: COLORS.danger }]}>
                Exit{" "}
              </Text>
              <FontAwesome5 name="power-off" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </>
        ) : (
          currentScreen !== "WINNER" && (
            <TouchableOpacity onPress={goToMenu} style={styles.navBtn}>
              <FontAwesome5 name="arrow-left" size={16} color="#fff" />
              <Text style={styles.navText}> Menu</Text>
            </TouchableOpacity>
          )
        )}
        {currentScreen === "GAME" && (
          <Text style={styles.roundInfo}>
            Round {gameSettings.currentRound}/{gameSettings.rounds}
          </Text>
        )}
        {currentScreen === "HISTORY" && (
          <TouchableOpacity
            onPress={() => deleteHistory()}
            style={styles.navBtn}
          >
            <Text style={{ color: COLORS.danger, fontWeight: "bold" }}>
              Clear All
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {currentScreen === "MENU" && renderMenu()}
      {currentScreen === "GAME" && renderGame()}
      {currentScreen === "WINNER" && renderWinner()}
      {currentScreen === "HISTORY" && renderHistory()}
      {renderFooter()}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  topBar: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: "#1a1a1a",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#333",
    borderRadius: 8,
  },
  navText: {
    color: COLORS.text,
    fontWeight: "bold",
    marginLeft: 5,
    fontSize: 14,
  },
  roundInfo: { color: COLORS.primary, fontSize: 18, fontWeight: "bold" },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 20,
    letterSpacing: 1,
  },
  label: {
    color: COLORS.textDim,
    fontSize: 14,
    marginBottom: 5,
    marginLeft: 5,
  },
  subLabel: { color: "#666", fontSize: 12, marginBottom: 5, marginLeft: 5 },
  inputBox: { width: "85%", marginBottom: 10 },
  input: {
    backgroundColor: "#fff",
    width: "100%",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    color: "#000",
  },
  chip: {
    backgroundColor: "#444",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#666",
  },
  chipText: { color: "#fff", fontSize: 14 },
  roundsSection: { width: "90%", marginTop: 15, marginBottom: 25 },
  roundsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
    paddingLeft: 5,
  },
  roundsLabel: {
    color: COLORS.textDim,
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 10,
    letterSpacing: 1,
  },
  roundsContainer: { flexDirection: "row", justifyContent: "space-between" },
  roundBtn: {
    width: "30%",
    height: 60,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#333",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#555",
    elevation: 3,
  },
  selectedRound: {
    backgroundColor: COLORS.primary,
    borderColor: "#f39c12",
    transform: [{ scale: 1.05 }],
    elevation: 8,
  },
  roundText: { color: "#bbb", fontWeight: "bold", fontSize: 22 },
  selectedRoundText: { color: "#222", fontWeight: "900" },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#222",
    marginTop: 4,
  },
  startBtn: {
    backgroundColor: COLORS.secondary,
    padding: 15,
    borderRadius: 10,
    width: "85%",
    alignItems: "center",
    elevation: 5,
  },
  btnText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  resetBtn: {
    backgroundColor: COLORS.danger,
    padding: 15,
    borderRadius: 30,
    width: 200,
    alignItems: "center",
    marginTop: 30,
  },
  scoreBoard: {
    flexDirection: "row",
    width: "90%",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  pBox: {
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: "#333",
    borderWidth: 1,
    borderColor: "#444",
  },
  activePBox: { borderColor: COLORS.primary, backgroundColor: "#444" },
  pName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  score: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  board: {
    width: 320,
    maxWidth: "95%",
    height: 320,
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#444",
    borderRadius: 15,
    overflow: "hidden",
    elevation: 10,
  },
  square: {
    width: "33.33%",
    height: "33.33%",
    borderWidth: 2,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3a3a3a",
  },
  cellText: { fontSize: 55, fontWeight: "bold" },
  turnText: { color: "#888", marginTop: 25, fontSize: 18, fontStyle: "italic" },
  resultCard: {
    width: 300,
    height: 300,
    backgroundColor: COLORS.card,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.primary,
    elevation: 10,
  },
  resultTitle: { color: "#ccc", fontSize: 24, marginBottom: 10 },
  resultName: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
  },
  winnerText: {
    fontSize: 30,
    color: COLORS.primary,
    fontWeight: "bold",
    marginTop: 20,
  },
  winnerName: {
    fontSize: 45,
    color: "#fff",
    fontWeight: "bold",
    marginVertical: 20,
    textAlign: "center",
  },
  finalScore: { fontSize: 24, color: "#ccc" },
  historyCard: {
    backgroundColor: "#333",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  historyDate: { color: "#888", fontSize: 12 },
  historyPlayers: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  footerContainer: {
    width: "100%",
    padding: 20,
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#333",
  },
  footerText: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  socialIcons: { flexDirection: "row", gap: 25 },
  iconBtn: { padding: 5 },
});
