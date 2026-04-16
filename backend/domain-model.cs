using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace GachaGame.Domain;

public enum PoolStatus
{
    Available,
    Owned,
    Downed,
    Dead,
    WaitingForResurrection
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
    public PoolStatus Status { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class UserInventoryEntry
{
    public Guid InventoryId { get; init; }
    public Guid UserId { get; init; }
    public Guid CharacterId { get; init; }
    public int CurrentHp { get; set; }
    public bool IsLocked { get; set; }
    public bool IsDowned { get; set; }
    public DateTime? DownedExpireAtUtc { get; set; }
}

public interface IGachaRepository
{
    Task<Guid> PullAtomicAsync(Guid userId, string bannerTag, long cost, string idempotencyKey, CancellationToken ct);
    Task<bool> ReviveAsync(Guid userId, Guid characterId, CancellationToken ct);
    Task<IReadOnlyList<CharacterPoolEntry>> GetLivePoolAsync(byte minRarity, CancellationToken ct);
}

public sealed class GachaService
{
    private readonly IGachaRepository _repo;

    public GachaService(IGachaRepository repo)
    {
        _repo = repo;
    }

    public Task<Guid> PullAsync(Guid userId, string bannerTag, long cost, string idempotencyKey, CancellationToken ct)
        => _repo.PullAtomicAsync(userId, bannerTag, cost, idempotencyKey, ct);

    public Task<bool> UseSoulStoneAsync(Guid userId, Guid characterId, CancellationToken ct)
        => _repo.ReviveAsync(userId, characterId, ct);
}

public sealed class MatchmakingScore
{
    public static int Calculate(byte rarity, int atk, int def, int hp)
    {
        var rarityWeight = rarity * 100;
        var statScore = (atk * 3) + (def * 2) + hp;
        return rarityWeight + statScore;
    }
}
