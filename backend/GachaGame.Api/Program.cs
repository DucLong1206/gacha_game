using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<GameStore>();
builder.Services.AddSingleton<GachaService>();
builder.Services.AddSingleton<MatchmakingService>();
builder.Services.AddSingleton<BattleService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new { ok = true, utc = DateTime.UtcNow }));

app.MapPost("/api/dev/seed", (GameStore store) =>
{
    store.SeedDemoData();
    return Results.Ok(new { message = "Seeded demo data" });
});

app.MapGet("/api/users", (GameStore store) => Results.Ok(store.Users.Values.OrderBy(x => x.UserName)));

app.MapGet("/api/users/{userId:guid}", (Guid userId, GameStore store) =>
    store.Users.TryGetValue(userId, out var user)
        ? Results.Ok(user)
        : Results.NotFound(new { message = "User not found" }));

app.MapGet("/api/roster/{userId:guid}", (Guid userId, GameStore store) =>
{
    var roster = store.InventoryByCharacter.Values
        .Where(x => x.UserId == userId)
        .Join(store.Characters.Values,
            inv => inv.CharacterId,
            c => c.CharacterId,
            (inv, c) => new RosterItemDto(
                c.CharacterId,
                c.Name,
                c.Rarity,
                c.IsUnique,
                inv.CurrentHp,
                inv.IsDowned,
                inv.DownedExpireAtUtc))
        .OrderByDescending(x => x.Rarity)
        .ToList();

    return Results.Ok(roster);
});

app.MapPost("/api/gacha/pull", async (PullRequest request, GachaService service, CancellationToken ct) =>
{
    var result = await service.PullAsync(request, ct);
    return result.IsSuccess ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapGet("/api/pool/live", (byte minRarity, GameStore store) =>
{
    var list = store.Pool.Values
        .Where(p => p.Status == PoolStatus.Available)
        .Join(store.Characters.Values,
            p => p.CharacterId,
            c => c.CharacterId,
            (p, c) => new LivePoolDto(c.CharacterId, c.Name, c.Rarity, p.BannerTag))
        .Where(x => x.Rarity >= minRarity)
        .OrderByDescending(x => x.Rarity)
        .ToList();

    return Results.Ok(list);
});

app.MapPost("/api/roster/{characterId:guid}/downed", (Guid characterId, DownedRequest request, GameStore store) =>
{
    if (!store.InventoryByCharacter.TryGetValue(characterId, out var inv) || inv.UserId != request.UserId)
    {
        return Results.NotFound(new { message = "Character not found in user inventory" });
    }

    inv.CurrentHp = 0;
    inv.IsDowned = true;
    inv.DownedExpireAtUtc = DateTime.UtcNow.AddSeconds(request.SecondsToRevive <= 0 ? 120 : request.SecondsToRevive);

    if (store.Pool.TryGetValue(characterId, out var poolEntry))
    {
        poolEntry.Status = PoolStatus.Downed;
        poolEntry.UpdatedAtUtc = DateTime.UtcNow;
    }

    return Results.Ok(new
    {
        message = "Character is now downed",
        inv.CharacterId,
        inv.DownedExpireAtUtc
    });
});

app.MapPost("/api/roster/{characterId:guid}/revive", async (Guid characterId, ReviveRequest request, GachaService service, CancellationToken ct) =>
{
    var result = await service.ReviveAsync(characterId, request.UserId, request.ConsumeSoulStone, ct);
    return result.IsSuccess ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/internal/permadeath/finalize", (FinalizePermadeathRequest request, GachaService service) =>
{
    var now = request.NowUtc ?? DateTime.UtcNow;
    var finalized = service.FinalizePermadeath(now);
    return Results.Ok(new { message = "Permadeath finalized", count = finalized, nowUtc = now });
});

app.MapPost("/api/battle/fight", async (BattleRequest request, BattleService service, CancellationToken ct) =>
{
    var result = await service.FightAsync(request, ct);
    return result.IsSuccess ? Results.Ok(result) : Results.BadRequest(result);
});

app.MapPost("/api/matchmaking/enqueue", (MatchmakingRequest request, MatchmakingService service, GameStore store) =>
{
    var team = request.TeamCharacterIds
        .Distinct()
        .Select(id => store.Characters.GetValueOrDefault(id))
        .Where(c => c is not null)
        .Cast<Character>()
        .ToList();

    if (team.Count == 0)
    {
        return Results.BadRequest(new { message = "Team is empty or invalid" });
    }

    var ticket = service.Enqueue(request.UserId, team);
    return Results.Ok(ticket);
});

app.MapHub<GameHub>("/hubs/game");

app.Run();

public sealed class GameHub : Hub;

public enum PoolStatus
{
    Available,
    Owned,
    Downed,
    Dead,
    WaitingForResurrection
}

public sealed class User
{
    public Guid UserId { get; init; }
    public string UserName { get; init; } = string.Empty;
    public long PremiumCurrency { get; set; }
    public int SoulStone { get; set; }
}

public sealed class Character
{
    public Guid CharacterId { get; init; }
    public string Name { get; init; } = string.Empty;
    public byte Rarity { get; init; }
    public bool IsUnique { get; init; }
    public int BaseHp { get; init; }
    public int BaseAtk { get; init; }
    public int BaseDef { get; init; }
}

public sealed class CharacterPoolEntry
{
    public Guid CharacterId { get; init; }
    public Guid? OwnerId { get; set; }
    public PoolStatus Status { get; set; } = PoolStatus.Available;
    public string BannerTag { get; set; } = "season1-global";
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class InventoryEntry
{
    public Guid InventoryId { get; init; } = Guid.NewGuid();
    public Guid UserId { get; init; }
    public Guid CharacterId { get; init; }
    public int CurrentHp { get; set; }
    public bool IsDowned { get; set; }
    public DateTime? DownedExpireAtUtc { get; set; }
}

public sealed class GachaTransaction
{
    public Guid TransactionId { get; init; } = Guid.NewGuid();
    public Guid UserId { get; init; }
    public string IdempotencyKey { get; init; } = string.Empty;
    public Guid CharacterId { get; init; }
    public long Cost { get; init; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
}

public sealed class GameStore
{
    public ConcurrentDictionary<Guid, User> Users { get; } = new();
    public ConcurrentDictionary<Guid, Character> Characters { get; } = new();
    public ConcurrentDictionary<Guid, CharacterPoolEntry> Pool { get; } = new();
    public ConcurrentDictionary<Guid, InventoryEntry> InventoryByCharacter { get; } = new();
    public ConcurrentDictionary<string, GachaTransaction> TransactionsByIdempotency { get; } = new();

    public void SeedDemoData()
    {
        Users.Clear();
        Characters.Clear();
        Pool.Clear();
        InventoryByCharacter.Clear();
        TransactionsByIdempotency.Clear();

        var userA = new User
        {
            UserId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            UserName = "Long",
            PremiumCurrency = 5000,
            SoulStone = 2
        };

        var userB = new User
        {
            UserId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            UserName = "Linh",
            PremiumCurrency = 5000,
            SoulStone = 1
        };

        Users.TryAdd(userA.UserId, userA);
        Users.TryAdd(userB.UserId, userB);

        var roster = new[]
        {
            new Character { CharacterId = Guid.NewGuid(), Name = "Mercenary A", Rarity = 2, IsUnique = false, BaseHp = 950, BaseAtk = 90, BaseDef = 50 },
            new Character { CharacterId = Guid.NewGuid(), Name = "Mercenary B", Rarity = 3, IsUnique = false, BaseHp = 1050, BaseAtk = 110, BaseDef = 60 },
            new Character { CharacterId = Guid.NewGuid(), Name = "General Kaito", Rarity = 6, IsUnique = false, BaseHp = 1800, BaseAtk = 240, BaseDef = 150 },
            new Character { CharacterId = Guid.NewGuid(), Name = "Astra The Void", Rarity = 9, IsUnique = true, BaseHp = 2400, BaseAtk = 330, BaseDef = 210 },
            new Character { CharacterId = Guid.NewGuid(), Name = "Ragnar 0", Rarity = 10, IsUnique = true, BaseHp = 3000, BaseAtk = 420, BaseDef = 260 },
            new Character { CharacterId = Guid.NewGuid(), Name = "Miko Blader", Rarity = 5, IsUnique = false, BaseHp = 1600, BaseAtk = 190, BaseDef = 120 },
            new Character { CharacterId = Guid.NewGuid(), Name = "Titan Brute", Rarity = 7, IsUnique = false, BaseHp = 2200, BaseAtk = 260, BaseDef = 180 }
        };

        foreach (var c in roster)
        {
            Characters.TryAdd(c.CharacterId, c);
            Pool.TryAdd(c.CharacterId, new CharacterPoolEntry
            {
                CharacterId = c.CharacterId,
                Status = PoolStatus.Available,
                OwnerId = null,
                BannerTag = "season1-global",
                UpdatedAtUtc = DateTime.UtcNow
            });
        }
    }
}

public sealed class GachaService
{
    private readonly GameStore _store;
    private readonly IHubContext<GameHub> _hub;
    private readonly SemaphoreSlim _pullLock = new(1, 1);

    public GachaService(GameStore store, IHubContext<GameHub> hub)
    {
        _store = store;
        _hub = hub;
    }

    public async Task<PullResult> PullAsync(PullRequest request, CancellationToken ct)
    {
        if (request.UserId == Guid.Empty || string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            return PullResult.Fail("Invalid userId or idempotency key");
        }

        await _pullLock.WaitAsync(ct);
        try
        {
            var txKey = $"{request.UserId}:{request.IdempotencyKey}";
            if (_store.TransactionsByIdempotency.TryGetValue(txKey, out var existingTx)
                && _store.Characters.TryGetValue(existingTx.CharacterId, out var existingCharacter))
            {
                return PullResult.Success(existingCharacter, request.Cost, true);
            }

            if (!_store.Users.TryGetValue(request.UserId, out var user))
            {
                return PullResult.Fail("User not found");
            }

            if (request.Cost <= 0 || user.PremiumCurrency < request.Cost)
            {
                return PullResult.Fail("Insufficient premium currency");
            }

            var available = _store.Pool.Values
                .Where(p => p.Status == PoolStatus.Available && (string.IsNullOrWhiteSpace(request.BannerTag) || p.BannerTag == request.BannerTag))
                .Join(_store.Characters.Values, p => p.CharacterId, c => c.CharacterId, (p, c) => (Pool: p, Character: c))
                .ToList();

            if (available.Count == 0)
            {
                return PullResult.Fail("Pool is empty for selected banner");
            }

            var pulled = PickByWeightedRandom(available);
            user.PremiumCurrency -= request.Cost;

            pulled.Pool.OwnerId = request.UserId;
            pulled.Pool.Status = PoolStatus.Owned;
            pulled.Pool.UpdatedAtUtc = DateTime.UtcNow;

            _store.InventoryByCharacter[pulled.Character.CharacterId] = new InventoryEntry
            {
                UserId = request.UserId,
                CharacterId = pulled.Character.CharacterId,
                CurrentHp = pulled.Character.BaseHp
            };

            var tx = new GachaTransaction
            {
                UserId = request.UserId,
                CharacterId = pulled.Character.CharacterId,
                Cost = request.Cost,
                IdempotencyKey = request.IdempotencyKey
            };
            _store.TransactionsByIdempotency[txKey] = tx;

            await _hub.Clients.All.SendAsync("PoolUpdated", new
            {
                pulled.Character.CharacterId,
                pulled.Character.Name,
                pulled.Character.Rarity,
                ownerId = request.UserId,
                isUnique = pulled.Character.IsUnique
            }, ct);

            return PullResult.Success(pulled.Character, request.Cost, false);
        }
        finally
        {
            _pullLock.Release();
        }
    }

    public async Task<ActionResultDto> ReviveAsync(Guid characterId, Guid userId, bool consumeSoulStone, CancellationToken ct)
    {
        if (!_store.InventoryByCharacter.TryGetValue(characterId, out var inv) || inv.UserId != userId)
        {
            return ActionResultDto.Fail("Character not found in inventory");
        }

        if (!inv.IsDowned)
        {
            return ActionResultDto.Fail("Character is not downed");
        }

        if (!consumeSoulStone)
        {
            return ActionResultDto.Fail("Revive requires consumeSoulStone=true");
        }

        if (!_store.Users.TryGetValue(userId, out var user) || user.SoulStone <= 0)
        {
            return ActionResultDto.Fail("No soul stone available");
        }

        user.SoulStone -= 1;

        var character = _store.Characters[characterId];
        inv.IsDowned = false;
        inv.DownedExpireAtUtc = null;
        inv.CurrentHp = Math.Max(1, character.BaseHp / 2);

        if (_store.Pool.TryGetValue(characterId, out var pool))
        {
            pool.Status = PoolStatus.Owned;
            pool.OwnerId = userId;
            pool.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _hub.Clients.User(userId.ToString()).SendAsync("CharacterRevived", new
        {
            characterId,
            hp = inv.CurrentHp,
            userSoulStone = user.SoulStone
        }, ct);

        return ActionResultDto.Success("Revived successfully");
    }

    public int FinalizePermadeath(DateTime nowUtc)
    {
        var expired = _store.InventoryByCharacter.Values
            .Where(x => x.IsDowned && x.DownedExpireAtUtc.HasValue && x.DownedExpireAtUtc.Value <= nowUtc)
            .ToList();

        foreach (var inv in expired)
        {
            _store.InventoryByCharacter.TryRemove(inv.CharacterId, out _);

            if (_store.Pool.TryGetValue(inv.CharacterId, out var pool))
            {
                pool.OwnerId = null;
                pool.Status = PoolStatus.Available;
                pool.UpdatedAtUtc = nowUtc;
            }
        }

        return expired.Count;
    }

    private static (CharacterPoolEntry Pool, Character Character) PickByWeightedRandom(List<(CharacterPoolEntry Pool, Character Character)> list)
    {
        var total = list.Sum(x => WeightForRarity(x.Character.Rarity));
        var roll = Random.Shared.Next(1, total + 1);

        var cumulative = 0;
        foreach (var item in list)
        {
            cumulative += WeightForRarity(item.Character.Rarity);
            if (roll <= cumulative)
            {
                return item;
            }
        }

        return list[^1];
    }

    private static int WeightForRarity(byte rarity)
        => rarity switch
        {
            <= 3 => 100,
            <= 7 => 40,
            <= 9 => 8,
            _ => 2
        };
}

public sealed class BattleService
{
    private readonly GameStore _store;
    private readonly IHubContext<GameHub> _hub;

    public BattleService(GameStore store, IHubContext<GameHub> hub)
    {
        _store = store;
        _hub = hub;
    }

    public async Task<BattleResult> FightAsync(BattleRequest request, CancellationToken ct)
    {
        if (!_store.InventoryByCharacter.TryGetValue(request.CharacterId, out var inventory) || inventory.UserId != request.UserId)
        {
            return BattleResult.Fail("Character not found in your roster.");
        }

        if (inventory.IsDowned)
        {
            return BattleResult.Fail("Character is downed, revive first.");
        }

        if (!_store.Characters.TryGetValue(request.CharacterId, out var character))
        {
            return BattleResult.Fail("Character metadata missing.");
        }

        var enemyPower = request.Difficulty switch
        {
            "hard" => Random.Shared.Next(1500, 2600),
            "nightmare" => Random.Shared.Next(2400, 3800),
            _ => Random.Shared.Next(800, 1800)
        };

        var heroPower = character.BaseAtk * 2 + character.BaseDef + inventory.CurrentHp / 4;
        var swing = Random.Shared.Next(-200, 201);
        var finalHero = heroPower + swing;

        if (finalHero >= enemyPower)
        {
            var damage = Random.Shared.Next(80, 260);
            inventory.CurrentHp = Math.Max(1, inventory.CurrentHp - damage);

            var reward = request.Difficulty switch
            {
                "hard" => 220,
                "nightmare" => 380,
                _ => 120
            };

            if (_store.Users.TryGetValue(request.UserId, out var user))
            {
                user.PremiumCurrency += reward;
            }

            await _hub.Clients.User(request.UserId.ToString()).SendAsync("BattleResolved", new
            {
                request.CharacterId,
                result = "win",
                hp = inventory.CurrentHp,
                reward
            }, ct);

            return BattleResult.Success(
                "WIN",
                $"{character.Name} đã thắng! Nhận {reward} gem.",
                inventory.CurrentHp,
                reward,
                false,
                null);
        }

        inventory.CurrentHp = 0;
        inventory.IsDowned = true;
        inventory.DownedExpireAtUtc = DateTime.UtcNow.AddSeconds(120);

        if (_store.Pool.TryGetValue(request.CharacterId, out var pool))
        {
            pool.Status = PoolStatus.Downed;
            pool.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _hub.Clients.User(request.UserId.ToString()).SendAsync("BattleResolved", new
        {
            request.CharacterId,
            result = "downed",
            hp = 0,
            downedExpireAtUtc = inventory.DownedExpireAtUtc
        }, ct);

        return BattleResult.Success(
            "DOWNED",
            $"{character.Name} bị hạ gục. Hồi sinh trong 120s hoặc sẽ mất vĩnh viễn.",
            0,
            0,
            true,
            inventory.DownedExpireAtUtc);
    }
}

public sealed class MatchmakingService
{
    private readonly ConcurrentQueue<MatchmakingTicket> _queue = new();

    public MatchmakingTicket Enqueue(Guid userId, IReadOnlyList<Character> team)
    {
        var score = team.Sum(c => CalculateScore(c.Rarity, c.BaseAtk, c.BaseDef, c.BaseHp));
        var ticket = new MatchmakingTicket(Guid.NewGuid(), userId, score, DateTime.UtcNow, team.Select(t => t.CharacterId).ToList());
        _queue.Enqueue(ticket);
        return ticket;
    }

    private static int CalculateScore(byte rarity, int atk, int def, int hp)
        => (rarity * 100) + (atk * 3) + (def * 2) + hp;
}

public record PullRequest(Guid UserId, string BannerTag, long Cost, string IdempotencyKey);
public record ReviveRequest(Guid UserId, bool ConsumeSoulStone);
public record DownedRequest(Guid UserId, int SecondsToRevive);
public record FinalizePermadeathRequest(DateTime? NowUtc);
public record MatchmakingRequest(Guid UserId, List<Guid> TeamCharacterIds);
public record BattleRequest(Guid UserId, Guid CharacterId, string Difficulty);

public record LivePoolDto(Guid CharacterId, string Name, byte Rarity, string BannerTag);
public record RosterItemDto(Guid CharacterId, string Name, byte Rarity, bool IsUnique, int CurrentHp, bool IsDowned, DateTime? DownedExpireAtUtc);
public record MatchmakingTicket(Guid TicketId, Guid UserId, int TeamScore, DateTime EnqueuedAtUtc, List<Guid> TeamCharacterIds);

public record PullResult(bool IsSuccess, string Message, Guid? CharacterId, string? CharacterName, byte? Rarity, long Cost, bool IsIdempotentReplay)
{
    public static PullResult Success(Character character, long cost, bool replay)
        => new(true, "Pull success", character.CharacterId, character.Name, character.Rarity, cost, replay);

    public static PullResult Fail(string message)
        => new(false, message, null, null, null, 0, false);
}

public record ActionResultDto(bool IsSuccess, string Message)
{
    public static ActionResultDto Success(string message) => new(true, message);
    public static ActionResultDto Fail(string message) => new(false, message);
}

public record BattleResult(bool IsSuccess, string Status, string Message, int CurrentHp, int Reward, bool IsDowned, DateTime? DownedExpireAtUtc)
{
    public static BattleResult Success(string status, string message, int hp, int reward, bool isDowned, DateTime? downedExpireAtUtc)
        => new(true, status, message, hp, reward, isDowned, downedExpireAtUtc);

    public static BattleResult Fail(string message)
        => new(false, "ERROR", message, 0, 0, false, null);
}
