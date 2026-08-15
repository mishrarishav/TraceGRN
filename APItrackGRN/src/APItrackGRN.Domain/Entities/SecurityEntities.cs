using APItrackGRN.Domain.Common;

namespace APItrackGRN.Domain.Entities;

public sealed class Role : BaseEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public ICollection<User> Users { get; set; } = [];
}

public sealed class User : BaseEntity
{
    public required string Username { get; set; }
    public required string FullName { get; set; }
    public required string EmployeeCode { get; set; }
    public required string PasswordHash { get; set; }
    public Guid RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastLoginAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
}

public sealed class RefreshToken : BaseEntity
{
    public required string TokenHash { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
}
