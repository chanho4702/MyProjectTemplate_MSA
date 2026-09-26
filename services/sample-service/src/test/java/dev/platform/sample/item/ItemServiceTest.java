package dev.platform.sample.item;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ItemServiceTest {
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-15T03:00:00Z"), ZoneOffset.UTC);

    @Test
    void createsItemWithUtcClock() {
        ItemRepository repository = mock(ItemRepository.class);
        when(repository.save(any(Item.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ItemService service = new ItemService(repository, CLOCK);

        ItemResponse response = service.create("  reusable template  ");

        assertThat(response.name()).isEqualTo("reusable template");
        assertThat(response.createdAt()).isEqualTo(Instant.parse("2026-08-15T03:00:00Z"));
    }

    @Test
    void findAllReadsOnlyTheRequestedPageNewestFirst() {
        ItemRepository repository = mock(ItemRepository.class);
        Item stored = new Item(UUID.randomUUID(), "stored", Instant.parse("2026-08-15T00:00:00Z"));
        when(repository.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(stored)));
        ItemService service = new ItemService(repository, CLOCK);

        List<ItemResponse> page = service.findAll(2, 25);

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        org.mockito.Mockito.verify(repository).findAll(pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isEqualTo(2);
        assertThat(pageable.getValue().getPageSize()).isEqualTo(25);
        assertThat(pageable.getValue().getSort()).isEqualTo(Sort.by(Sort.Direction.DESC, "createdAt"));
        assertThat(page).extracting(ItemResponse::name).containsExactly("stored");
    }
}
