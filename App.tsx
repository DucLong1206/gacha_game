import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Screen = 'radar' | 'battle' | 'reward' | 'defeat';
type Coordinates = { latitude: number; longitude: number };
type Card = {
  id: string;
  name: string;
  manaCost: number;
  cooldown: number;
  damage: number;
  shield: number;
  description: string;
  rarity?: 'base' | 'common' | 'rare' | 'epic';
};
type Enemy = {
  id: string;
  name: string;
  maxHP: number;
  currentHP: number;
  attackPower: number;
  attackSpeed: number;
};
type SaveData = {
  gold: number;
  deck: Card[];
};

const STORAGE_KEY = 'gps-card-battler-save-v1';
const GPS_REFRESH_MS = 3000;
const ENTER_BATTLE_DISTANCE_M = 10;
const BATTLE_TICK_MS = 100;
const MAX_MANA = 10;
const MAX_PLAYER_HP = 100;
const DEFAULT_DECK: Card[] = [
  {
    id: 'chem_manh_01',
    name: 'Chém Mạnh',
    manaCost: 3,
    cooldown: 5000,
    damage: 15,
    shield: 0,
    description: 'Gây 15 sát thương. Hồi chiêu 5 giây.',
    rarity: 'base',
  },
  {
    id: 'khien_go_01',
    name: 'Khiên Gỗ',
    manaCost: 2,
    cooldown: 4000,
    damage: 0,
    shield: 10,
    description: 'Nhận 10 giáp chắn đòn kế tiếp. Hồi chiêu 4 giây.',
    rarity: 'base',
  },
  {
    id: 'dam_nhanh_01',
    name: 'Đâm Nhanh',
    manaCost: 1,
    cooldown: 2500,
    damage: 6,
    shield: 0,
    description: 'Gây 6 sát thương. Rẻ và hồi nhanh.',
    rarity: 'base',
  },
];
const REWARD_CARDS: Card[] = [
  {
    id: 'cau_lua_01',
    name: 'Cầu Lửa',
    manaCost: 4,
    cooldown: 6500,
    damage: 24,
    shield: 0,
    description: 'Gây 24 sát thương lửa. Hồi chiêu 6.5 giây.',
    rarity: 'rare',
  },
  {
    id: 'giap_thep_01',
    name: 'Giáp Thép',
    manaCost: 4,
    cooldown: 7000,
    damage: 0,
    shield: 24,
    description: 'Dựng 24 giáp. Hồi chiêu 7 giây.',
    rarity: 'rare',
  },
  {
    id: 'song_kich_01',
    name: 'Song Kích',
    manaCost: 5,
    cooldown: 8000,
    damage: 32,
    shield: 0,
    description: 'Gây 32 sát thương. Hồi chiêu 8 giây.',
    rarity: 'epic',
  },
  {
    id: 'hoi_phuc_01',
    name: 'Bùa Hộ Mệnh',
    manaCost: 3,
    cooldown: 6000,
    damage: 0,
    shield: 18,
    description: 'Tạo 18 giáp để sống sót trong lượt cắn tiếp theo.',
    rarity: 'common',
  },
];
const ENEMY_TEMPLATES: Enemy[] = [
  {
    id: 'slime_nuoc_01',
    name: 'Quái Slime Nước',
    maxHP: 50,
    currentHP: 50,
    attackPower: 8,
    attackSpeed: 3000,
  },
  {
    id: 'doi_doc_01',
    name: 'Dơi Độc',
    maxHP: 65,
    currentHP: 65,
    attackPower: 10,
    attackSpeed: 2600,
  },
  {
    id: 'golem_da_01',
    name: 'Golem Đá Nhỏ',
    maxHP: 85,
    currentHP: 85,
    attackPower: 14,
    attackSpeed: 4200,
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatMeters = (distance: number | null) => (distance === null ? '--' : `${distance.toFixed(1)}m`);
const formatSeconds = (milliseconds: number) => `${Math.max(0, milliseconds / 1000).toFixed(1)}s`;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const degrees = (rad: number) => (rad * 180) / Math.PI;

const haversineDistanceMeters = (from: Coordinates, to: Coordinates) => {
  const earthRadiusMeters = 6371000;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLon = radians(to.longitude - from.longitude);
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
};

const createTargetNearPlayer = (origin: Coordinates): Coordinates => {
  const earthRadiusMeters = 6371000;
  const distance = 20 + Math.random() * 30;
  const bearing = Math.random() * Math.PI * 2;
  const lat1 = radians(origin.latitude);
  const lon1 = radians(origin.longitude);
  const angularDistance = distance / earthRadiusMeters;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: degrees(lat2), longitude: degrees(lon2) };
};

const randomEnemy = () => {
  const template = ENEMY_TEMPLATES[Math.floor(Math.random() * ENEMY_TEMPLATES.length)];
  return { ...template, currentHP: template.maxHP };
};

const pickRewardCards = (ownedCards: Card[]) => {
  const ownedIds = new Set(ownedCards.map((card) => card.id));
  const availableCards = REWARD_CARDS.filter((card) => !ownedIds.has(card.id));
  const pool = availableCards.length >= 3 ? availableCards : REWARD_CARDS;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('radar');
  const [locationPermission, setLocationPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [playerPosition, setPlayerPosition] = useState<Coordinates | null>(null);
  const [enemyTarget, setEnemyTarget] = useState<Coordinates | null>(null);
  const [distanceToEnemy, setDistanceToEnemy] = useState<number | null>(null);
  const [radarMessage, setRadarMessage] = useState('Đang xin quyền GPS...');
  const [saveData, setSaveData] = useState<SaveData>({ gold: 0, deck: DEFAULT_DECK });
  const [playerHP, setPlayerHP] = useState(MAX_PLAYER_HP);
  const [playerShield, setPlayerShield] = useState(0);
  const [mana, setMana] = useState(0);
  const [enemy, setEnemy] = useState<Enemy>(randomEnemy());
  const [enemyCountdown, setEnemyCountdown] = useState(enemy.attackSpeed);
  const [cardCooldowns, setCardCooldowns] = useState<Record<string, number>>({});
  const [battleLog, setBattleLog] = useState<string[]>(['Sẵn sàng chiến đấu!']);
  const [rewardGold, setRewardGold] = useState(0);
  const [rewardOptions, setRewardOptions] = useState<Card[]>([]);
  const manaCarryRef = useRef(0);
  const battleEndedRef = useRef(false);

  const canEnterBattle = distanceToEnemy !== null && distanceToEnemy <= ENTER_BATTLE_DISTANCE_M;

  const pushBattleLog = useCallback((message: string) => {
    setBattleLog((current) => [message, ...current].slice(0, 5));
  }, []);

  const persistSave = useCallback(async (nextSave: SaveData) => {
    setSaveData(nextSave);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSave));
  }, []);

  useEffect(() => {
    let gpsTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const loadSaveAndGps = async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SaveData;
        setSaveData({
          gold: parsed.gold ?? 0,
          deck: parsed.deck?.length ? parsed.deck : DEFAULT_DECK,
        });
      }

      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationPermission('denied');
        setRadarMessage('Bạn cần bật quyền GPS để quét radar.');
        return;
      }

      setLocationPermission('granted');
      const refreshLocation = async () => {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (disposed) {
          return;
        }
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setPlayerPosition(nextPosition);
        setEnemyTarget((target) => {
          if (target) {
            setDistanceToEnemy(haversineDistanceMeters(nextPosition, target));
          }
          return target;
        });
        setRadarMessage('GPS đang cập nhật mỗi 3 giây. Hãy quét để tìm quái.');
      };

      await refreshLocation();
      gpsTimer = setInterval(refreshLocation, GPS_REFRESH_MS);
    };

    loadSaveAndGps();

    return () => {
      disposed = true;
      if (gpsTimer) {
        clearInterval(gpsTimer);
      }
    };
  }, []);

  const scanRadar = useCallback(() => {
    if (!playerPosition) {
      setRadarMessage('Chưa có tọa độ GPS. Vui lòng đợi tín hiệu.');
      return;
    }
    const target = createTargetNearPlayer(playerPosition);
    setEnemyTarget(target);
    setDistanceToEnemy(haversineDistanceMeters(playerPosition, target));
    setRadarMessage('Đã phát hiện dao động ma lực! Hãy đi bộ tới mục tiêu trong bán kính 10m.');
  }, [playerPosition]);

  const resetBattle = useCallback(() => {
    const nextEnemy = randomEnemy();
    setEnemy(nextEnemy);
    setEnemyCountdown(nextEnemy.attackSpeed);
    setPlayerHP(MAX_PLAYER_HP);
    setPlayerShield(0);
    setMana(0);
    manaCarryRef.current = 0;
    battleEndedRef.current = false;
    setCardCooldowns({});
    setBattleLog(['Bắt đầu trận đấu thời gian thực!']);
  }, []);

  const startBattle = useCallback(() => {
    resetBattle();
    setScreen('battle');
  }, [resetBattle]);

  const finishVictory = useCallback(() => {
    if (battleEndedRef.current) {
      return;
    }
    battleEndedRef.current = true;
    const earnedGold = 12 + Math.floor(Math.random() * 14);
    setRewardGold(earnedGold);
    setRewardOptions(pickRewardCards(saveData.deck));
    const nextSave = { ...saveData, gold: saveData.gold + earnedGold };
    persistSave(nextSave);
    setEnemyTarget(null);
    setDistanceToEnemy(null);
    setScreen('reward');
  }, [persistSave, saveData]);

  const finishDefeat = useCallback(() => {
    if (battleEndedRef.current) {
      return;
    }
    battleEndedRef.current = true;
    const survivorDeck = saveData.deck.filter((card) => card.rarity === 'base' || card.rarity === 'common');
    const nextSave = { ...saveData, deck: survivorDeck.length ? survivorDeck : DEFAULT_DECK };
    persistSave(nextSave);
    setEnemyTarget(null);
    setDistanceToEnemy(null);
    setScreen('defeat');
  }, [persistSave, saveData]);

  useEffect(() => {
    if (screen !== 'battle') {
      return undefined;
    }

    const timer = setInterval(() => {
      manaCarryRef.current += BATTLE_TICK_MS;
      if (manaCarryRef.current >= 1000) {
        const recovered = Math.floor(manaCarryRef.current / 1000);
        manaCarryRef.current %= 1000;
        setMana((currentMana) => clamp(currentMana + recovered, 0, MAX_MANA));
      }

      setCardCooldowns((currentCooldowns) => {
        const nextCooldowns: Record<string, number> = {};
        Object.entries(currentCooldowns).forEach(([cardId, cooldown]) => {
          nextCooldowns[cardId] = Math.max(0, cooldown - BATTLE_TICK_MS);
        });
        return nextCooldowns;
      });

      setEnemyCountdown((currentCountdown) => {
        const nextCountdown = currentCountdown - BATTLE_TICK_MS;
        if (nextCountdown > 0) {
          return nextCountdown;
        }

        setPlayerHP((currentHP) => {
          const absorbed = Math.min(playerShield, enemy.attackPower);
          const damageTaken = enemy.attackPower - absorbed;
          if (absorbed > 0) {
            setPlayerShield((shield) => Math.max(0, shield - absorbed));
          }
          if (damageTaken > 0) {
            pushBattleLog(`${enemy.name} cắn bạn ${damageTaken} sát thương!`);
          } else {
            pushBattleLog('Giáp đã chặn toàn bộ đòn đánh!');
          }
          const nextHP = Math.max(0, currentHP - damageTaken);
          if (nextHP <= 0) {
            finishDefeat();
          }
          return nextHP;
        });
        return enemy.attackSpeed;
      });
    }, BATTLE_TICK_MS);

    return () => clearInterval(timer);
  }, [enemy, finishDefeat, playerShield, pushBattleLog, screen]);

  useEffect(() => {
    if (screen === 'battle' && enemy.currentHP <= 0) {
      finishVictory();
    }
  }, [enemy.currentHP, finishVictory, screen]);

  const playCard = useCallback(
    (card: Card) => {
      const cooldownLeft = cardCooldowns[card.id] ?? 0;
      if (mana < card.manaCost || cooldownLeft > 0) {
        Alert.alert('Chưa thể dùng bài', 'Không đủ Mana hoặc lá bài vẫn đang hồi chiêu.');
        return;
      }

      setMana((currentMana) => currentMana - card.manaCost);
      setCardCooldowns((currentCooldowns) => ({ ...currentCooldowns, [card.id]: card.cooldown }));
      if (card.damage > 0) {
        setEnemy((currentEnemy) => ({
          ...currentEnemy,
          currentHP: Math.max(0, currentEnemy.currentHP - card.damage),
        }));
        pushBattleLog(`${card.name} gây ${card.damage} sát thương!`);
      }
      if (card.shield > 0) {
        setPlayerShield((currentShield) => currentShield + card.shield);
        pushBattleLog(`${card.name} tạo ${card.shield} giáp!`);
      }
    },
    [cardCooldowns, mana, pushBattleLog],
  );

  const chooseReward = useCallback(
    (card: Card) => {
      const hasCard = saveData.deck.some((ownedCard) => ownedCard.id === card.id);
      const nextSave = {
        ...saveData,
        deck: hasCard ? saveData.deck : [...saveData.deck, card],
      };
      persistSave(nextSave);
      resetBattle();
      setScreen('radar');
      setRadarMessage('Đã nhận thưởng. Quét Radar để mở chuyến đi tiếp theo.');
    },
    [persistSave, resetBattle, saveData],
  );

  const returnAfterDefeat = useCallback(() => {
    resetBattle();
    setScreen('radar');
    setRadarMessage('Bạn đã hồi sinh tại Radar. Bài hiếm trong chuyến đi đã bị mất.');
  }, [resetBattle]);

  const radarStatus = useMemo(() => {
    if (locationPermission === 'checking') {
      return 'Đang kiểm tra GPS...';
    }
    if (locationPermission === 'denied') {
      return 'GPS bị từ chối';
    }
    if (!enemyTarget) {
      return 'Chưa có mục tiêu';
    }
    return canEnterBattle ? 'Trong tầm giao chiến!' : 'Tiếp tục đi bộ tới mục tiêu';
  }, [canEnterBattle, enemyTarget, locationPermission]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {screen === 'radar' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>GPS CARD BATTLER</Text>
          <Text style={styles.subtitle}>Radar Thám Hiểm Offline</Text>
          <View style={styles.panel}>
            <Text style={styles.label}>Trạng thái</Text>
            <Text style={styles.value}>{radarStatus}</Text>
            <Text style={styles.message}>{radarMessage}</Text>
          </View>
          <View style={styles.grid}>
            <StatBox label="Vàng" value={`${saveData.gold}`} />
            <StatBox label="Khoảng cách" value={formatMeters(distanceToEnemy)} />
          </View>
          <View style={styles.panel}>
            <Text style={styles.label}>Tọa độ người chơi</Text>
            <Text style={styles.coords}>
              {playerPosition
                ? `${playerPosition.latitude.toFixed(6)}, ${playerPosition.longitude.toFixed(6)}`
                : 'Đang chờ GPS...'}
            </Text>
            <Text style={styles.label}>Tọa độ quái vật</Text>
            <Text style={styles.coords}>
              {enemyTarget ? `${enemyTarget.latitude.toFixed(6)}, ${enemyTarget.longitude.toFixed(6)}` : 'Chưa quét'}
            </Text>
          </View>
          <Pressable style={[styles.primaryButton, !playerPosition && styles.disabledButton]} onPress={scanRadar} disabled={!playerPosition}>
            <Text style={styles.buttonText}>QUÉT RADAR</Text>
          </Pressable>
          <Pressable style={[styles.dangerButton, !canEnterBattle && styles.disabledButton]} onPress={startBattle} disabled={!canEnterBattle}>
            <Text style={styles.buttonText}>VÀO TRẬN</Text>
          </Pressable>
          <DeckPreview cards={saveData.deck} />
        </ScrollView>
      )}

      {screen === 'battle' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>ĐẤU TRƯỜNG ATB</Text>
          <View style={styles.panel}>
            <Text style={styles.enemyName}>{enemy.name}</Text>
            <HealthBar current={enemy.currentHP} max={enemy.maxHP} color="#f97316" />
            <Text style={styles.value}>Quái tấn công sau: {formatSeconds(enemyCountdown)}</Text>
          </View>
          <View style={styles.grid}>
            <StatBox label="Máu" value={`${playerHP}/${MAX_PLAYER_HP}`} />
            <StatBox label="Mana" value={`${mana}/${MAX_MANA}`} />
            <StatBox label="Giáp" value={`${playerShield}`} />
          </View>
          <View style={styles.cardGrid}>
            {saveData.deck.map((card) => {
              const cooldownLeft = cardCooldowns[card.id] ?? 0;
              const disabled = mana < card.manaCost || cooldownLeft > 0;
              return <CardButton key={card.id} card={card} cooldownLeft={cooldownLeft} disabled={disabled} onPress={() => playCard(card)} />;
            })}
          </View>
          <View style={styles.panel}>
            <Text style={styles.label}>Nhật ký trận đấu</Text>
            {battleLog.map((log, index) => (
              <Text key={`${log}-${index}`} style={styles.logLine}>• {log}</Text>
            ))}
          </View>
        </ScrollView>
      )}

      {screen === 'reward' && (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>CHIẾN THẮNG!</Text>
          <Text style={styles.subtitle}>Bạn nhận {rewardGold} vàng. Chọn 1 lá bài mới.</Text>
          {rewardOptions.map((card) => (
            <Pressable key={card.id} style={styles.rewardCard} onPress={() => chooseReward(card)}>
              <Text style={styles.cardName}>{card.name}</Text>
              <Text style={styles.cardMeta}>Mana {card.manaCost} • CD {formatSeconds(card.cooldown)} • {card.rarity}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {screen === 'defeat' && (
        <View style={styles.container}>
          <Text style={styles.title}>BẠN ĐÃ HY SINH</Text>
          <Text style={styles.subtitle}>Cơ chế Roguelike: giữ vàng cốt lõi, mất bài hiếm đã nhặt trong chuyến đi.</Text>
          <Pressable style={styles.primaryButton} onPress={returnAfterDefeat}>
            <Text style={styles.buttonText}>HỒI SINH VỀ RADAR</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function HealthBar({ current, max, color }: { current: number; max: number; color: string }) {
  const percent = `${clamp((current / max) * 100, 0, 100)}%` as `${number}%`;
  return (
    <View style={styles.healthOuter}>
      <View style={[styles.healthInner, { width: percent, backgroundColor: color }]} />
      <Text style={styles.healthText}>{current}/{max} HP</Text>
    </View>
  );
}

function CardButton({ card, cooldownLeft, disabled, onPress }: { card: Card; cooldownLeft: number; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.cardButton, disabled && styles.cardDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.cardName}>{card.name}</Text>
      <Text style={styles.cardMeta}>Mana {card.manaCost} • CD {formatSeconds(card.cooldown)}</Text>
      <Text style={styles.cardDescription}>{card.description}</Text>
      {cooldownLeft > 0 && <Text style={styles.cooldownText}>Hồi: {formatSeconds(cooldownLeft)}</Text>}
    </Pressable>
  );
}

function DeckPreview({ cards }: { cards: Card[] }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Bộ bài hiện tại ({cards.length})</Text>
      {cards.map((card) => (
        <Text key={card.id} style={styles.logLine}>• {card.name} — {card.description}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08111f',
  },
  container: {
    flexGrow: 1,
    gap: 16,
    padding: 20,
    backgroundColor: '#08111f',
  },
  title: {
    color: '#e0f2fe',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subtitle: {
    color: '#93c5fd',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  panel: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e3a8a',
    borderRadius: 18,
    backgroundColor: '#0f172a',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: 96,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#172554',
  },
  label: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  statValue: {
    marginTop: 4,
    color: '#facc15',
    fontSize: 22,
    fontWeight: '900',
  },
  message: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
  },
  coords: {
    color: '#bfdbfe',
    fontVariant: ['tabular-nums'],
  },
  primaryButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2563eb',
  },
  dangerButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#dc2626',
  },
  disabledButton: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  enemyName: {
    color: '#fed7aa',
    fontSize: 22,
    fontWeight: '900',
  },
  healthOuter: {
    height: 28,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#1f2937',
  },
  healthInner: {
    height: '100%',
  },
  healthText: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    color: '#ffffff',
    fontWeight: '900',
    lineHeight: 28,
    textAlign: 'center',
  },
  cardGrid: {
    gap: 12,
  },
  cardButton: {
    gap: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 18,
    backgroundColor: '#0e7490',
  },
  cardDisabled: {
    opacity: 0.5,
    borderColor: '#64748b',
    backgroundColor: '#334155',
  },
  cardName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  cardMeta: {
    color: '#bae6fd',
    fontWeight: '700',
  },
  cardDescription: {
    color: '#e2e8f0',
    lineHeight: 20,
  },
  cooldownText: {
    color: '#fecaca',
    fontWeight: '900',
  },
  logLine: {
    color: '#dbeafe',
    lineHeight: 21,
  },
  rewardCard: {
    gap: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#facc15',
    borderRadius: 18,
    backgroundColor: '#713f12',
  },
});
